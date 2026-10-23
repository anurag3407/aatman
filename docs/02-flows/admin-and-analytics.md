# Admin and analytics

## Purpose

Give the institute a truthful picture of service reach and operation without giving anyone a
window into individual students. The admin dashboard is read-only and aggregate-only.

## Access

`/admin` calls `requireStaffPage(["admin", "counsellor"])`.

- `admin` role: Dashboard only in the staff nav.
- `counsellor` role: also sees the dashboard, alongside their operational screens.
- `student`: redirected to `/`.

There is no admin API. The page queries aggregates directly through server components.

## What is displayed

### Service stats (last 28 days)

| Metric | Definition |
|---|---|
| Slots offered | Count of slots with `starts_at` in the window and `starts_at <= now` |
| Slots booked | Of those, count with `status = 'booked'` |
| Sessions attended | Count with `attended_at IS NOT NULL` |
| No-shows | Count with `no_show_at IS NOT NULL` |
| Contact requests | Count created in the window |
| Median hours to first contact | Median of `contacted_at - created_at` over contacted requests, only if n ≥ 10 |

Important nuance: "slots offered" counts rows whose start time has passed, not every slot
ever created. This makes the denominator comparable to attended/no-show. A slot currently
booked but in the future is not in the 28-day offered count until it starts.

### Weekly check-in table (last 12 weeks)

| Column | Definition |
|---|---|
| Week of | `date_trunc('week', created_at)` as `YYYY-MM-DD` |
| Students | Distinct pseudonyms with a check-in that week |
| Check-ins | Total check-ins that week |
| Mild / Moderate / Elevated / Urgent / Crisis | Count per tier |

Rows are sorted newest week first. Empty weeks are omitted (the query groups only weeks with
data), so the table may be shorter than 12 rows.

## k-anonymity and suppression

`K_MIN = 10`.

### Cell suppression

```text
for each count c:
  if 0 < c < 10 → "suppressed"
if exactly one cell was suppressed:
  suppress the smallest remaining non-zero numeric cell too
```

Why complementary suppression: if a row total is shown and only one cell is hidden, the
hidden value is `total - sum(visible)`. Hiding a second cell prevents that subtraction. The
implementation hides the smallest remaining non-zero cell, preserving as much utility as
possible.

### Total suppression

`suppressTotal(n)` hides a total if `0 < n < 10`.

### Median suppression

The median hours-to-contact is `null` unless at least 10 contacted requests exist in the
window. A median over a handful of requests can describe one person's experience.

### Display

Suppressed cells render as `<10`. Zero renders as `0`. The page header states the rule.

## Queries

### Weekly tier counts

```sql
SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
       tier,
       count(*)::int AS n
FROM checkins
WHERE created_at >= now - 12 weeks
GROUP BY week, tier;

SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
       count(DISTINCT pseudonym)::int AS students
FROM checkins
WHERE created_at >= now - 12 weeks
GROUP BY week;
```

The service assembles a tier map per week, suppresses, and returns typed cells.

### Service stats

```sql
SELECT count(*)::int AS offered,
       count(*) FILTER (WHERE status = 'booked')::int AS booked,
       count(*) FILTER (WHERE attended_at IS NOT NULL)::int AS attended,
       count(*) FILTER (WHERE no_show_at IS NOT NULL)::int AS no_show
FROM slots
WHERE starts_at >= now - 28 days AND starts_at <= now;

SELECT count(*)::int FROM contact_requests
WHERE created_at >= now - 28 days;

SELECT percentile_cont(0.5) WITHIN GROUP (
         ORDER BY extract(epoch FROM (contacted_at - created_at)) / 3600
       ) AS hours,
       count(*)::int AS n
FROM contact_requests
WHERE created_at >= now - 28 days AND contacted_at IS NOT NULL;
```

## What the admin cannot see

| Data | Available? |
|---|---|
| Names, emails, roll numbers | No — never stored |
| Individual check-in answers or scores | No |
| Individual tiers with timestamps | No route returns them |
| Free text | No — never stored |
| Chat transcripts | No — never stored |
| Contact details | No |
| Alert details | No |
| Counsellor notes | No |
| Booking identities | No |

The dashboard only calls `weeklyTierCounts` and `serviceStats`. There is no drill-down, no
export, and no raw-row endpoint.

## Interpretation guide

| Pattern | Plausible reading | Check before acting |
|---|---|---|
| High mild share, low moderate+ | Early reach; possible under-reporting | Completion rate, campus events, exam calendar |
| Rising crisis count | Real increase or better detection/reporting | Compare with alert acknowledgement times and staffing |
| Many `elevated` due to skipped item 9 | Students skipping the sensitive question | Consider copy/UX review; do not assume pathology |
| High no-show | Access barriers (timing, location, stigma) | Slot times, reminders, transport |
| Long median to first contact | Queue capacity or rota gaps | Staffing, request severity mix |
| Slot offered ≫ booked | Low demand or poor discovery | Placement of booking CTA, counsellor language coverage |

Aggregates cannot establish causation. They are operational signals, not research data.
Any publication or secondary use needs ethics review.

## Privacy constraints on reporting

- Do not add filters that produce cells below 10 without suppression.
- Do not add "export CSV" of rows.
- Do not join aggregates with institute enrolment data unless the DPO and ethics committee
  approve a protocol.
- Do not present tier labels to students as diagnoses; they are internal routing categories.
- Do not report per-counsellor caseloads in a way that identifies students (small n).

## Testing

Integration tests cover:

- Suppression of small counts and one complementary cell.
- No week with fewer than 10 students is reported as a number.
- Admin role access to `/admin`; student denial.
- E2E: "students can't open staff pages, and admins see aggregates only."

## Related reading

- [Audit and aggregates domain](../03-domains/audit-and-aggregates.md)
- [Personas and roles](../00-overview/personas-and-roles.md)
- [db.md](../04-data/db.md)
- [Testing strategy](../07-quality/testing-strategy.md)
