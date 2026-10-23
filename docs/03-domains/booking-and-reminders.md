# Booking and reminders

## Purpose

A simple, concurrency-safe scheduling system for campus counselling: counsellors publish
slots, students book one at a time, and neutral SMS reminders reduce no-shows. There is no
calendar integration, recurring calendar sync, waitlist, or payment.

Source: `src/lib/services/booking.ts`, `src/lib/services/reminders.ts`.

## Constants

| Constant | Value | Meaning |
|---|---|---|
| `BOOKING_WINDOW_DAYS` | 14 | Students see slots starting within 14 days |
| `MAX_UPCOMING_BOOKINGS` | 2 | Cap on future booked sessions per student |
| Slot duration | 15–120 min | Validated by the staff form |
| Slots per day | 1–12 | Back-to-back on the first day |
| Repeat weeks | 1–12 | Weekly recurrence |
| Reminder windows | 22–26 h, 1.5–2.5 h | Sent at ~24 h and ~2 h |
| Reminder throttle | 15 min | Prevents retry hot loops |

## Slot model

```text
slots
  id uuid
  counsellor_email text            -- not a FK; links to counsellors.email
  starts_at, ends_at timestamptz
  location text
  mode in_person|phone|video
  status open|booked|cancelled
  booked_by → students.pseudonym (set null on delete)
  booked_at
  shared_checkin_id → checkins.id (set null on delete)
  contact_enc                       -- { phone } encrypted
  is_urgent
  reminder_opt_in
  reminder_24_attempt_at / sent_at
  reminder_2_attempt_at / sent_at
  attended_at / no_show_at / marked_by
  created_at
```

Indices: `(starts_at)`, `(booked_by)`.

## Listing

### Student open slots

```ts
listOpenSlots(now, { includeUrgent })
  WHERE status = 'open'
    AND starts_at > now
    AND starts_at < now + 14 days
    AND (includeUrgent OR is_urgent = false)
  ORDER BY starts_at
  LEFT JOIN counsellors ON email
```

Returns `{ id, startsAt, endsAt, location, mode, isUrgent, counsellorName, counsellorLanguages }`.
An unknown counsellor profile yields `null` name/languages, not an error.

### Student's bookings

```ts
listStudentBookings(pseudonym, now)
  WHERE booked_by = pseudonym AND ends_at > now
  ORDER BY starts_at
```

Includes cancelled bookings so the student sees "cancelled".

### Staff slots

```ts
listStaffSlots(now)
  WHERE ends_at >= now AND status IN ('open','booked')
  ORDER BY starts_at
```

Includes `booked`, `shared`, `reminderOptIn`, attendance flags.

## Eligibility

`mayUseUrgent(pseudonym)`:

```ts
latestCheckin(p).triage.tier >= "elevated"
```

Priority slots:

- hidden in the student list when ineligible;
- rejected in `bookSlot` with `not_eligible` (403);
- rejected in `rescheduleBooking` with `not_eligible`.

This is a safety feature: reserved capacity for students who need earlier support.

## Booking

```ts
bookSlot(pseudonym, slotId, { shareLatestCheckin, phone?, reminderOptIn? }, now)
  → { ok: true } | { ok: false, error: "taken"|"too_many"|"no_checkin"|"not_eligible" }
```

Steps:

1. Load the slot by id.
2. If missing, not open, or not future → `taken`.
3. If priority and ineligible → `not_eligible`.
4. Count upcoming booked slots for the student; if ≥ 2 → `too_many`.
5. If sharing: load the latest check-in; if none → `no_checkin`; else record its id.
6. Conditional update:

```sql
UPDATE slots
   SET status = 'booked',
       booked_by = $pseudonym,
       booked_at = $now,
       shared_checkin_id = $shared,
       contact_enc = $sealedPhoneOrNull,
       reminder_opt_in = $reminderOptIn
 WHERE id = $slot
   AND status = 'open'
   AND starts_at > $now
RETURNING id;
```

7. If no row returned → `taken`.

`reminderOptIn = Boolean(phone && reminderOptIn)`; a reminder without a phone is impossible.
`contactEnc` is `seal({ phone }, pseudonym)` only when a phone is supplied.

### Why conditional update

Pre-checks are not atomic. Two concurrent requests can both see an open slot. The
`UPDATE … WHERE status='open'` is the only authority; exactly one transaction can change the
row.

## Cancel

```sql
UPDATE slots
   SET status='open', booked_by=NULL, booked_at=NULL,
       shared_checkin_id=NULL, contact_enc=NULL, reminder_opt_in=false,
       reminder_24_attempt_at=NULL, reminder_24_sent_at=NULL,
       reminder_2_attempt_at=NULL, reminder_2_sent_at=NULL,
       attended_at=NULL, no_show_at=NULL, marked_by=NULL
 WHERE id=$slot AND booked_by=$p AND status='booked' AND starts_at > now
```

- Student-owned, future, booked only.
- Returns false if no row (mapped to 404).
- A past booking cannot be cancelled; staff mark attendance instead.

Staff cancellation (`cancelSlotAsStaff`) sets only `status='cancelled'` and audits. It does
not clear the student's data; the student still sees the cancelled row.

## Reschedule

```ts
rescheduleBooking(pseudonym, fromId, toId, now)
```

1. Same id → `not_found`.
2. Load target; if priority and ineligible → `not_eligible`.
3. Transaction:
   - `SELECT from FOR UPDATE` where owned, booked, future.
   - `SELECT to FOR UPDATE` where open, future.
   - If either missing → `not_found` / `taken`.
   - Clear `from`.
   - Book `to` carrying `sharedCheckinId`, `contactEnc`, `reminderOptIn`; reset reminder
     timestamps.
4. Audit `reschedule_booking` with actor `"student"`.

Row locks serialize concurrent reschedules involving the same slots. The old slot is released
only after the new one is secured.

## Slot creation

`createSlots(counsellorEmail, spec)`:

```text
for w in 0..weeks-1:
  for i in 0..perDay-1:
    start = firstStart + w*7d + i*duration
    end   = start + duration
    insert { counsellorEmail, start, end, location, mode, isUrgent }
```

- All slots are `open`.
- No duplicate or overlap detection.
- Audit `create_slots` with the count.
- `firstStart` is built by the server action as `new Date(`${start}:00+05:30`)`.

## Reminders

`runAppointmentReminders(now, send)` is called by `POST /api/cron/alerts` every minute.

### Selection

```text
status = 'booked'
reminder_opt_in = true
contact_enc IS NOT NULL
booked_by IS NOT NULL
starts_at BETWEEN window.from AND window.to
sent_at IS NULL
(attempt_at IS NULL OR attempt_at < now - 15 min)
```

| Reminder | From | To | Columns |
|---|---|---|---|
| 24-hour | now + 22 h | now + 26 h | `reminder_24_*` |
| 2-hour | now + 1.5 h | now + 2.5 h | `reminder_2_*` |

### Send

1. Decrypt `{ phone }` with `bookedBy` as AAD. On failure, skip.
2. Format the start in English, IST, e.g. `Mon, 3 Nov, 6:30 pm`.
3. `sendSms({ to, text: "Reminder: your appointment is on <when>." })`.
4. Record attempt; record sent time only on success.

### Privacy properties

- Message contains no counsellor name, location, mode, or reason.
- Phone never enters `notification_outbox`.
- No email/SMS content is logged.
- Development fallback logs only the last four digits.
- Reminder rows are per-slot columns, not a separate message table.

### Timezone

All display uses `Asia/Kolkata`. The SMS text is generated server-side with `formatDate(...)`,
so it is stable across hosts. The cron runs in UTC; the windows are relative to `now`, so they
are timezone-independent.

## Attendance

```ts
markAttendance(slotId, actor, attended, now)
  UPDATE slots SET
    attended_at = attended ? now : null,
    no_show_at = attended ? null : now,
    marked_by = actor
  WHERE id = slotId AND status = 'booked' AND starts_at < now
  RETURNING id
```

- Only after start.
- Attended and no-show are mutually exclusive.
- Audit `mark_attendance`.
- Drives the 28-day dashboard metrics.

## Concurrency summary

| Operation | Mechanism |
|---|---|
| Book | Conditional `UPDATE … WHERE status='open'` |
| Reschedule | Transaction + `FOR UPDATE` on both rows |
| Cancel | Conditional update on owner/status/future |
| Attendance | Conditional update on booked/past |
| Reminder send | Attempt-timestamp throttle; no row lock (duplicate send possible under a crash) |

## Edge cases

| Case | Result |
|---|---|
| Slot starts exactly now | `starts_at > now` is false → not bookable |
| Slot ends in the past but status open | Not listed; retention eventually deletes |
| Student has 2 future bookings and one is cancelled | Cap counts only booked; can book again |
| Reschedule keeps the same shared check-in | Yes, carried |
| Reschedule a priority slot to a normal slot | Allowed if the student is eligible; if not, `not_eligible` |
| Phone changes on reschedule | Not supported; the booking form only sets phone at booking |
| Counsellor profile missing | Slot still lists; name/languages null |
| Slot deleted by retention while booked | Only slots with `ends_at < cutoff` are deleted; past bookings disappear from history |
| Reminder sent but student cancels | Cancellation clears sent timestamps and status; no further reminders |

## Metrics

The admin dashboard uses:

- offered (past 28 days),
- booked,
- attended,
- no-show,
- median hours to first contact (from contact requests, not bookings).

There is no per-counsellor utilization report, by design (small numbers could identify
students).

## Testing

`tests/services/services.test.ts`:

- Exactly one of two concurrent bookings wins.
- Sharing only when asked; cancel returns the slot.
- Cap on upcoming bookings.

`tests/services/access.test.ts`:

- Counsellor name/languages shown with slots.
- Priority slots hidden unless eligible.
- Eligibility enforced at booking.
- Atomic reschedule; original kept when target taken.
- Attendance only after start.
- 24 h and 2 h reminders sent once.

## Related reading

- [Booking flow](../02-flows/booking.md)
- [Counsellor workflow](../02-flows/counsellor-workflow.md)
- [db.md](../04-data/db.md)
- [API reference](../05-api/api-reference.md)
