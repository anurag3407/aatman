# Audit and aggregates

## Two separate accountability mechanisms

| Mechanism | Answers | Contains student content? | Audience |
|---|---|---|---|
| **Audit log** | Who did what to which record, when | No — ids only | Operators, DPO |
| **Aggregates** | How many, by tier/week/service | No — counts only, k ≥ 10 | Counsellors, admins |

Neither is a reporting database of individuals.

---

## Audit log

### Purpose

Make staff access and consequential actions attributable without recording the data they
accessed. The log is append-only by convention: there is no update or delete API; retention
removes rows older than 36 months.

### Schema

```text
audit_log
  id uuid
  at timestamptz default now()
  actor text        -- staff email, "student", or "system"
  action text       -- constrained union in code
  target_type text  -- e.g. "contact_request", "slot", "crisis_alert"
  target_id text    -- record id or count summary
```

Index: `(at)`.

### Actions

| Action | Actor | Trigger |
|---|---|---|
| `staff_login` | staff email | Successful staff sign-in |
| `view_contact_request` | counsellor email | Opening a request detail |
| `update_contact_request` | counsellor email | Status change |
| `view_booking` | counsellor email | Opening a booking detail |
| `view_alert` | counsellor email | Opening an alert detail |
| `acknowledge_alert` | counsellor email | Acknowledging |
| `resolve_alert` | counsellor email | Resolving |
| `create_on_call` | counsellor email | Adding a shift |
| `update_counsellor` | counsellor email | Profile upsert |
| `mark_attendance` | counsellor email | Attended/no-show |
| `reschedule_booking` | `"student"` | Successful reschedule |
| `create_slots` | counsellor email | Slot generation |
| `cancel_slot` | counsellor email | Staff cancellation |
| `student_erased` | `"student"` | Erasure (no target id) |
| `retention_run` | `"system"` | Daily retention, counts as target id |

### What is never written

- Answers, scores, free text, chat, contact details, notes.
- Session tokens, OIDC codes, secrets.
- Student pseudonyms as target ids? Pseudonyms are not used as `target_id`; record ids are.
  The `student_erased` action intentionally has no target.

### Reading the audit log

There is no UI. Operators query the database:

```sql
-- Who viewed student records in the last 7 days?
SELECT actor, action, count(*)
FROM audit_log
WHERE at > now() - interval '7 days'
  AND action LIKE 'view_%'
GROUP BY actor, action
ORDER BY count DESC;

-- Access trail for one request
SELECT at, actor, action
FROM audit_log
WHERE target_type = 'contact_request' AND target_id = $1
ORDER BY at;
```

Access to the audit table itself should be limited to operators/DPO. It reveals staff activity
and record ids, not student content.

### Limitations

- A read of the queue list is not audited because no student data is decrypted or returned.
- A read performed directly against the database by an operator is not audited by the app.
- Audit rows do not include IP addresses or user agents (deliberate minimisation).
- The log is app-level, not tamper-evident. A malicious root operator could alter it. If
  stronger guarantees are needed, ship rows to append-only external storage.

---

## Aggregates

### Purpose

Tell the institute whether the service is reaching students and functioning, without exposing
individuals.

Source: `src/lib/services/aggregates.ts`.

### k-anonymity rule

```ts
K_MIN = 10
```

- Any count from 1 to 9 is replaced with `"suppressed"` and displayed as `<10`.
- If exactly one cell in a row is suppressed, the smallest remaining non-zero numeric cell is
  also suppressed. This prevents deriving the hidden value from the row total.
- Totals and distinct-student counts are suppressed independently with the same rule.
- Medians are withheld when the sample is below 10.

### Weekly tier counts

Inputs: `weeks = 12`, `now`.

```sql
-- counts per week per tier
SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
       tier, count(*)::int AS n
FROM checkins
WHERE created_at >= now - 12 weeks
GROUP BY week, tier;

-- distinct students per week
SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
       count(DISTINCT pseudonym)::int AS students
FROM checkins
WHERE created_at >= now - 12 weeks
GROUP BY week;
```

Output:

```ts
interface WeekRow {
  weekStart: string;
  total: Cell;                    // number | "suppressed"
  students: Cell;
  byTier: Record<Tier, Cell>;
}
```

Weeks are sorted newest first. Weeks with no check-ins are absent.

### Service stats

Inputs: `days = 28`, `now`.

| Metric | Query |
|---|---|
| `slotsOffered` | count slots with `starts_at` in window and `<= now` |
| `slotsBooked` | of those, `status = 'booked'` |
| `sessionsAttended` | `attended_at IS NOT NULL` |
| `sessionsNoShow` | `no_show_at IS NOT NULL` |
| `contactRequests` | count created in window |
| `medianHoursToContact` | `percentile_cont(0.5)` of `contacted_at - created_at`, only if n ≥ 10 |

Suppression applies to attended, no-show, and contact requests. Offered and booked are named
counts in the type but not passed through `suppressTotal` in the current implementation; they
are operational capacity numbers rather than student counts. Review before exposing them more
widely.

### Complementary suppression example

Raw row: mild 42, moderate 8, elevated 3, urgent 1, crisis 2, total 56.

1. Counts 1–9 → suppressed: moderate, elevated, urgent, crisis suppressed.
2. More than one suppressed → no complementary step.
3. Display: 42, `<10`, `<10`, `<10`, `<10`, total 56.

Raw row: mild 42, moderate 20, elevated 0, urgent 0, crisis 0, total 62.

1. Nothing is 1–9 → no suppression.

Raw row: mild 42, moderate 20, elevated 8, urgent 0, crisis 0, total 70.

1. Elevated suppressed (one cell).
2. Complementary: hide the smallest remaining non-zero numeric cell → moderate 20.
3. Display: 42, `<10`, `<10`, 0, 0, total 70. The hidden elevated value cannot be derived
   because two cells are unknown.

### Why not just hide small cells

If only one cell is hidden, `hidden = total - sum(visible)`. Complementary suppression closes
that arithmetic channel. It costs utility but is the standard approach for small-count tables.

### Dashboard presentation

- Numbers formatted `en-IN`.
- Suppressed values shown as `<10`.
- Header states the rule.
- No drill-down, export, or filter controls.
- Admin and counsellor both have access.

### What aggregates cannot support

- Identifying a student or a small group.
- Per-counsellor caseload reporting at small n.
- Causal claims or research publication without ethics approval.
- Real-time monitoring of an individual.

### Privacy risks in repeated queries

Suppression protects a single table, but repeated queries with different date ranges, tiers, or
filters can narrow a small cell. The app exposes no ad-hoc query interface; the only aggregates
are the fixed weekly and 28-day views. Anyone with direct database access is outside this
control.

### Testing

`tests/services/services.test.ts`:

- Suppresses small counts and one complementary cell.
- Never reports a week with fewer than 10 students as a number.

`tests/e2e/checkin.spec.ts`:

- Admins see aggregates only; students cannot open staff pages.

## Design rationale

| Decision | Why |
|---|---|
| Audit ids, not content | Accountability without creating a second sensitive store |
| No audit UI | Least surface; operators query with controlled access |
| Aggregates computed at query time | No separate analytics store to secure or drift |
| k = 10, complementary suppression | Standard small-cell protection; simple to test |
| Median withheld below 10 | A median over a few people describes individuals |
| Admin has aggregates only | Broad operational authority should not imply broad data access |

## Related reading

- [Admin and analytics flow](../02-flows/admin-and-analytics.md)
- [Retention and erasure](retention-and-erasure.md)
- [Security architecture](../01-architecture/security-architecture.md)
- [db.md](../04-data/db.md)
