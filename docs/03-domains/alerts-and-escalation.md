# Alerts and escalation

## Purpose

A crisis or urgent check-in must reach a human who can act, even if the student never sends
contact details. The alert subsystem provides:

1. atomic alert creation with the check-in,
2. routing to the on-call counsellor,
3. a time-based escalation ladder,
4. durable, retrying, PII-free notifications,
5. a staff dashboard that never exposes more than the student chose to share.

Source: `src/lib/services/alerts.ts`, schema in `src/lib/db/schema.ts`.

## Data model

```text
crisis_alerts
  id, pseudonym, checkin_id?, contact_request_id?
  created_at, tier (crisis|urgent), status (open|acknowledged|resolved)
  acknowledged_at, acknowledged_by
  escalated_at, escalation_level (0..3)
  resolved_at, resolved_by
  note_enc            -- encrypted with the student's pseudonym

on_call_shifts
  id, staff_email, role (counsellor|clinical_lead)
  starts_at, ends_at, backup_email?, created_at

notification_outbox
  id, kind (crisis_alert|crisis_escalation), to_email
  subject, body, status (pending|sending|sent|dead)
  attempts, next_attempt_at, claimed_at, sent_at, last_error, created_at
```

The alert is a **pointer**, not a record. It contains no answers, scores, free text, or contact
details. `contact_request_id` is populated only after the student explicitly shares callback
details.

## Creation

Inside the check-in transaction:

```ts
const alertTier = result.tier === "crisis" || result.tier === "urgent" ? result.tier : null;
const recipients = alertTier ? await getAlertRecipients() : [];

db.transaction(async (tx) => {
  const [row] = await tx.insert(checkins).values({…}).returning(…);
  if (alertTier) {
    const [alert] = await tx.insert(crisisAlerts).values({ pseudonym, checkinId: row.id, tier: alertTier }).returning(…);
    if (recipients.length) {
      const message = alertNotification(alert.id, alertTier);
      await tx.insert(notificationOutbox).values(recipients.map(toEmail => ({…})));
    }
  }
});
```

Properties:

- No alert without a check-in.
- No check-in with a crisis/urgent tier and a missing alert.
- Notification rows are committed atomically, then delivered asynchronously.
- `elevated` does not create an alert.

## Recipient resolution

`getAlertRecipients(now)`:

```sql
SELECT staff_email
FROM on_call_shifts
WHERE starts_at <= now AND ends_at > now
ORDER BY CASE WHEN role = 'counsellor' THEN 0 ELSE 1 END;
```

- If any shift is active, all active staff emails (deduplicated) receive the initial alert.
- Otherwise `ALERT_EMAILS` is used.
- The role ordering puts counsellors before clinical leads in the recipient list; it does not
  exclude clinical leads who are on call.
- Windows are inclusive of `starts_at`, exclusive of `ends_at`.

## Notification content

Initial alert:

```text
Subject: Aatman: crisis check-in needs acknowledgement
Body:
  A crisis check-in needs acknowledgement.

  Open: https://<app>/counsellor/alerts/<id>

  This message contains no student details.
```

Escalation:

```text
Subject: Aatman: crisis alert still unacknowledged (backup counsellor)
Body:
  The crisis alert has not been acknowledged. Escalating to the backup counsellor.

  Open: …

  This message contains no student details.
```

No tier beyond crisis/urgent, no time of check-in, no campus, no pseudonym. The recipient
learns what they need to act: severity and a link.

## Escalation ladder

```ts
ESCALATION_MINUTES = {
  crisis: [10, 20, 30],
  urgent: [30, 60, 120],
}
```

| Level | Crisis | Urgent | Recipients |
|---|---|---|---|
| 1 | 10 min | 30 min | active shift `backup_email`s, else `ALERT_EMAILS` |
| 2 | 20 min | 60 min | `CLINICAL_LEAD_EMAILS`, else `ALERT_EMAILS` |
| 3 | 30 min | 120 min | `ADMIN_EMAILS`, else `ALERT_EMAILS` |

Algorithm (`runAlertEscalation`):

```text
now = parameter (injectable for tests)
fallback = ALERT_EMAILS
leads = CLINICAL_LEAD_EMAILS || fallback
admins = ADMIN_EMAILS || fallback
backups = backup_email of active shifts

transaction:
  SELECT * FROM crisis_alerts
   WHERE status = 'open' AND acknowledged_at IS NULL
   FOR UPDATE SKIP LOCKED

  for each alert:
    desired = count(threshold ≤ ageMinutes)
    if desired <= escalation_level: continue
    recipients = desired === 1 ? (backups || fallback)
               : desired === 2 ? leads
               : admins
    if recipients empty: continue
    INSERT outbox rows (kind crisis_escalation)
    UPDATE crisis_alerts
       SET escalation_level = desired, escalated_at = now
     WHERE id = … AND escalation_level = old
    escalated++
```

Properties:

- `SKIP LOCKED` prevents two replicas from escalating the same alert.
- The conditional update makes a repeated run idempotent.
- A jump from level 0 to 2 (e.g. a cron outage) sends only the level-2 notification, not levels
  1 and 2. This is intentional: page the right person now, don't spam history.
- Acknowledgement stops escalation because the query filters `acknowledged_at IS NULL`.

## Outbox

`processOutbox(now, send)`:

```text
1. Reset 'sending' rows whose claimed_at < now - 10 min → 'pending', claimedAt = null.
2. Transaction:
     SELECT * FROM notification_outbox
      WHERE status = 'pending' AND next_attempt_at <= now
      ORDER BY created_at
      LIMIT 20
      FOR UPDATE SKIP LOCKED
     UPDATE those rows → 'sending', claimed_at = now
3. Send each outside the transaction.
4. Success → 'sent', sent_at, attempts+1, last_error=null.
5. Failure → attempts+1;
     dead if attempts >= 5;
     else 'pending' with next_attempt_at = now + RETRY_MINUTES[attempts-1];
     RETRY_MINUTES = [1, 5, 15, 60] minutes (last value repeats).
     last_error truncated to 500 chars; claimed_at cleared.
```

Why claim then send: sending inside a database transaction would hold row locks across a
network call, and a crash would leave ambiguous delivery. Claiming first makes at-most-once
delivery likely and at-least-once delivery possible under a crash between send and mark. The
message is idempotent in content (same alert link), so duplicate delivery is tolerable.

Delivery transport:

- `NOTIFY_WEBHOOK_URL` receives `{ to, subject, text }`.
- Optional bearer token.
- 10-second timeout.
- Non-production without a webhook logs recipient + subject only.
- Production without a webhook returns `no_transport`; the outbox retries then marks dead.

## Staff views

`listOpenAlerts()`:

- status `open` or `acknowledged`;
- crisis first, then oldest.

`getAlertForStaff(id, actor)`:

- writes `view_alert`;
- returns alert fields and the decrypted resolution note;
- never returns answers, scores, or contact details.

`countOpenAlerts()` powers the nav badge.

`listOnCallShifts(now)` returns shifts ending after now, ordered by start.

## Acknowledgement and resolution

```ts
acknowledgeAlert(id, actor):
  UPDATE … SET status='acknowledged', acknowledged_at=now, acknowledged_by=actor
   WHERE id=… AND status='open'
   RETURNING id
  audit(acknowledge_alert)
```

- One-way from `open`; acknowledging twice is a no-op (`false`).
- Stops escalation immediately.

```ts
resolveAlert(id, actor, note):
  load alert (need pseudonym for AAD)
  trim note, max 2000 chars
  UPDATE … SET status='resolved', resolved_at=now, resolved_by=actor,
                note_enc = seal(note) if provided
   WHERE id=… AND status IN ('open','acknowledged')
  audit(resolve_alert)
```

- Can resolve directly from `open` (no forced acknowledgement).
- Note is encrypted with the student's pseudonym, so it is unreadable without the key and
  cannot be transplanted to another alert.
- `getAlertForStaff` decrypts it on read.

## On-call shifts

`createOnCallShift` validation:

| Rule | Error |
|---|---|
| Email contains `@` | throws |
| End after start | throws |
| Duration ≤ 7 days | throws |

Shifts are created by counsellors via the alerts page. There is no update/delete API in the
code; retention deletes shifts whose `ends_at` is older than 90 days. A mistaken shift must be
corrected by creating a covering shift or accepting the routing until it expires.

## Failure matrix

| Failure | Effect | Detection |
|---|---|---|
| No on-call shift | Initial alert goes to `ALERT_EMAILS` | Dashboard banner |
| No `ALERT_EMAILS` either | No recipients; alert exists but no email | Dashboard warning, recipients list empty |
| No email transport in production | Outbox retries then dead | Dashboard warning |
| Webhook 5xx/timeout | Retry 1/5/15/60 min; dead after 5 | `last_error` (operator DB access) |
| Cron not running | No escalation, no outbox delivery, no SMS | No automatic alerting; operator must monitor the cron container |
| Two replicas run cron | `SKIP LOCKED` prevents double claim | — |
| Process crashes mid-send | Row stuck `sending` until 10-minute reset, then retried | Possible duplicate |
| Acknowledgement at same moment as escalation | Race resolved by row lock; may still send one escalation email | Duplicate page, not missed page |
| Alert resolved without acknowledgement | Escalation stops because status ≠ open | — |
| Database down | No alert creation; check-in fails | Health 503 |

## Tuning and operations

- **Do not make escalation faster without staffing.** A 10-minute crisis ladder assumes an
  on-call human can acknowledge within 10 minutes.
- **Keep the rota populated.** A fallback list is a safety net, not coverage.
- **Monitor outbox depth.** There is no built-in metric; query
  `notification_outbox WHERE status='pending'` or inspect cron logs.
- **Dead letters need a human.** A dead crisis notification means nobody was paged by email.
- **Alert volume is a clinical/operational decision.** Widening crisis definitions increases
  pages.

## Testing

`tests/services/alerts.test.ts`:

- Alert created for crisis and urgent, not mild.
- PII-free notification body.
- Acknowledge once; resolve with encrypted note.
- Contact request links to open alert.
- Escalation stops after acknowledgement.
- Retries and dead-lettering.
- On-call routing precedes fallback.
- List ordering (crisis first).
- Staff view does not expose the pseudonym.
- Retention deletes resolved alerts and their notifications.

## Related reading

- [Crisis flow](../02-flows/crisis.md)
- [Crisis detection](crisis-detection.md)
- [db.md](../04-data/db.md)
- [Runbook](../06-operations/runbook.md)
