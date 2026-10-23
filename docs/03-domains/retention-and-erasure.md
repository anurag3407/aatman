# Retention and erasure

## Purpose

Two separate lifecycle controls:

- **Retention** automatically deletes data that is no longer needed, on a schedule.
- **Erasure** lets a student delete everything immediately.

Both are implemented as server-side services and are exercised by integration tests.

Source: `src/lib/services/retention.ts`, `src/lib/services/studentData.ts`.

## Retention policy

| Data | Default window | Exceptions | Where enforced |
|---|---|---|---|
| Check-ins | 12 months (`RETENTION_MONTHS`) | `keep = true` | `runRetention` |
| Contact requests | 12 months after creation | Only `closed` requests are deleted | `runRetention` |
| Slots | Until `ends_at` is older than the cutoff | — | `runRetention` |
| Resolved crisis alerts | 12 months after resolution | Only `resolved` | `runRetention` |
| Notification outbox | 30 days after creation | Only `sent`/`dead` | `runRetention` |
| On-call shifts | 90 days after end | — | `runRetention` |
| Audit log | 36 months hard-coded | — | `runRetention` |
| Rate-limit counters | 24 hours | — | `sweepRateLimits` |
| Students row | Not deleted by retention | Deleted only by erasure | — |

`RETENTION_MONTHS` is configurable from 1 to 60, default 12. The admin/history UI reads it so
the student sees the actual window.

### Why these windows

- 12 months lets a student and counsellor see a full academic year while limiting long-term
  sensitive storage.
- The `keep` flag exists because a student may want a record for continuity of care. It is
  opt-in per check-in and visible in history.
- Audit is kept longer (36 months) because it contains no student content and is needed for
  accountability.
- Operational rows (outbox, shifts, rate limits) are short-lived.

## Retention job

```text
POST /api/cron/retention
  Authorization: Bearer <CRON_SECRET>
    │
    └─ runRetention(RETENTION_MONTHS, now)
        cutoff      = now - RETENTION_MONTHS
        auditCutoff = now - 36 months

        DELETE checkins
          WHERE created_at < cutoff AND keep = false

        DELETE contact_requests
          WHERE created_at < cutoff AND status = 'closed'

        DELETE slots
          WHERE ends_at < cutoff

        DELETE crisis_alerts
          WHERE status = 'resolved' AND resolved_at < cutoff

        DELETE notification_outbox
          WHERE status IN ('sent','dead') AND created_at < now - 30d

        DELETE on_call_shifts
          WHERE ends_at < now - 90d

        DELETE rate_limits
          WHERE window_start < now - 24h

        audit("system", "retention_run", "counts", JSON.stringify(result))
```

Returns `{ checkins, contactRequests, slots, auditLog, rateLimits, alerts, notifications, onCallShifts }`.

### Cascade effects

| Deleted row | Effect |
|---|---|
| `checkins` | `contact_requests.checkin_id` → NULL; `slots.shared_checkin_id` → NULL. The booking remains, but the shared check-in is gone. |
| `students` (erasure only) | Cascades `checkins`, `contact_requests`, `crisis_alerts` |
| `crisis_alerts` | Outbox rows are independent and already PII-free; they are cleaned separately |
| `slots` | Past bookings disappear from history; aggregate counts remain only while rows exist |

### Scheduling

Reference VPS deployment:

- `deploy/cron/retention.sh` calls the endpoint with `CRON_SECRET`.
- Default schedule `30 21 * * *` UTC = 03:00 IST.
- The cron container writes its env to `/run/cron.env` because busybox crond does not pass the
  container environment.

Render or a managed platform must supply its own scheduler; the blueprint does not.

### Failure behavior

- If `CRON_SECRET` is missing, the route returns 401; in production env validation requires
  the secret.
- If the database is down, the job throws; the scheduler logs the failure.
- Deletion is chunkless (single statements). For very large tables this could lock or run
  long; at pilot scale it is fine. If data grows, add batching by id ranges.
- The audit row is written after deletion. If the audit insert fails, the deletions have
  already committed; the job's counts are lost from the audit trail. This is an accepted
  small gap.

## Keep flag

- Per check-in boolean, default `false`.
- `setKeep(pseudonym, id, keep)` is owner-scoped; returns false for unknown/foreign ids.
- The history UI toggles it (`KeepToggle`).
- Kept check-ins survive retention indefinitely until the student unkeeps or erases.
- `keep` is plaintext so retention can filter efficiently; it reveals only that a student
  chose to keep a row.

## Erasure

`DELETE /api/me` (student session, same-origin):

```ts
eraseStudent(pseudonym, now):
  transaction:
    UPDATE slots
       SET status='open', booked_by=NULL, booked_at=NULL,
           shared_checkin_id=NULL, contact_enc=NULL
     WHERE booked_by=pseudonym AND status='booked' AND starts_at > now

    UPDATE slots
       SET booked_by=NULL, shared_checkin_id=NULL, contact_enc=NULL
     WHERE booked_by=pseudonym

    DELETE FROM students WHERE pseudonym=pseudonym

  audit("student", "student_erased")   // no target id
  delete session cookie
```

Details:

- Future bookings return to the pool.
- Past bookings remain as rows with no owner (used for aggregate counts only).
- Deleting the student cascades check-ins, contact requests, and crisis alerts.
- The audit row deliberately has no target id: it records that an erasure happened, not whose.
- The client clears `sessionStorage` and performs a full page navigation so no erased-account
  state survives.

### What erasure does not delete

| Data | Why |
|---|---|
| Audit rows | Accountability; contain no content and no student target for erasure |
| Resolved alert? | Cascaded with the student row |
| Outbox rows | PII-free; cleaned by retention |
| Booking rows (past) | Owner cleared; aggregate counts |
| Server logs | Never contained student content |
| Backups | Retained per backup policy; expire naturally. Erasure does not rewrite existing dumps. |

Backups are a real limitation: a deletion today does not remove the student from yesterday's
`pg_dump`. Document this in the privacy notice. Backup retention is 14 days in the reference
deployment.

## Export

`GET /api/me/export` returns JSON with:

```text
exportedAt
account: { pseudonym, createdAt, consentVersion, consentAt } | null
checkins: [{ id, createdAt, tier, answers, campus, scores, summary, keep }]
contactRequests: [{ id, createdAt, status, contact }]
bookings: [{ id, startsAt, location, mode, status, sharedCheckin }]
```

- Owner-scoped.
- Decrypts sealed fields for the owner.
- Download filename `aatman-data.json`.
- No alert notes, audit rows, or staff data.

The export is a JSON attachment with `Content-Disposition`; no server-side copy is stored.

## Consent recording

`recordConsent(pseudonym)`:

```text
INSERT students(pseudonym) ON CONFLICT DO NOTHING
UPDATE students SET consent_version = current, consent_at = now()
```

Called by `POST /api/consent` for signed-in students, or during the OIDC callback using the
`aat_c` cookie for signed-out students.

## Retention vs. right to erasure

| Action | Scope | Trigger | Reversible |
|---|---|---|---|
| Keep | One check-in | Student | Yes |
| Unkeep | One check-in | Student | Yes |
| Retention | Old rows across all users | Cron | No |
| Erasure | All rows for one pseudonym | Student | No |
| Backup expiry | Dumps | Time | No |

## Operational checklist

- Confirm `RETENTION_MONTHS` matches the published privacy notice.
- Confirm the scheduler calls `/api/cron/retention` daily and that `CRON_SECRET` is set.
- Monitor the audit log for `retention_run` counts; a zero count every day may mean the job is
  not running (or there is genuinely nothing to delete).
- Test erasure in staging before launch; it is destructive and irreversible.
- Verify backups do not contain encryption keys.
- Publish the backup retention window alongside the erasure policy.

## Testing

`tests/services/services.test.ts`:

- Export returns decrypted data, then erasure removes everything and frees future bookings.
- Retention deletes old check-ins unless kept.
- Rate limits are swept.

`tests/services/alerts.test.ts`:

- Retention deletes resolved alerts and their notifications.

## Related reading

- [Privacy and crypto](privacy-and-crypto.md)
- [db.md](../04-data/db.md)
- [Runbook](../06-operations/runbook.md)
- [privacy-and-security.md](../privacy-and-security.md)
