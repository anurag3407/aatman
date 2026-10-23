# Booking flow

## Purpose

Students can book a free, confidential session with a campus counsellor without exposing
their check-in unless they explicitly choose to. Counsellors publish availability, manage a
queue, and record attendance. The design favours atomic operations and minimal data over
flexible scheduling.

## Actors and screens

| Actor | Screen | Action |
|---|---|---|
| Student | `/book` | View open slots, book, reschedule, cancel, share check-in, opt into SMS reminders |
| Student | `/results/{id}` | Booking action card for moderate+ results |
| Counsellor | `/counsellor` | See upcoming booked sessions, open a booking detail |
| Counsellor | `/counsellor/slots` | Create recurring slots, cancel slots, edit public profile |
| Counsellor | `/counsellor/bookings/{id}` | View shared check-in and contact phone, mark attendance |
| Cron | `POST /api/cron/alerts` | Send SMS reminders at ~24 h and ~2 h |

## Slot lifecycle

```text
                 createSlots()
                      │
                      ▼
                 ┌─────────┐   bookSlot()     ┌─────────┐
                 │  open   │─────────────────►│ booked  │
                 └────┬────┘   conditional    └────┬────┘
                      │         UPDATE              │
        cancelSlotAsStaff()                         │ cancelBooking()
                      │                             │ (student)
                      ▼                             ▼
                 ┌───────────┐                ┌─────────┐
                 │ cancelled │                │  open   │  (cleared)
                 └───────────┘                └─────────┘
                                                  │
                                     rescheduleBooking()
                                     (old cleared, new booked)
```

After the session time:

- A counsellor may mark `attendedAt` or `noShowAt` (only if `status = 'booked'` and
  `starts_at < now`).
- Retention deletes slots whose `ends_at` is older than the retention cutoff.

## Student view

`/book` (server component):

1. `requireStudentPage()`.
2. Load latest check-in to decide priority eligibility:
   `latest.tier >= elevated`.
3. `listOpenSlots(now, { includeUrgent })`:
   - status `open`
   - `starts_at > now`
   - `starts_at < now + 14 days`
   - excludes `is_urgent` unless eligible
   - ordered by start time
   - left-joins counsellor display name and languages
4. `listStudentBookings(pseudonym)`:
   - `booked_by = pseudonym`
   - `ends_at > now`
   - includes cancelled status so the student sees a cancellation
5. Renders `BookingView` with serialized dates.

### BookingView states

| State | UI |
|---|---|
| Idle, no open slots | Empty card + Tele-MANAS and iCall one-tap links |
| Idle, open slots | List of slots with date/time, mode, location, counsellor, priority badge |
| Selected slot | Confirmation card: share checkbox (if a check-in exists), phone field, reminder checkbox |
| Rescheduling | Banner "Choose a new time for {when}"; clicking a slot moves the booking |
| Success | Info banner |
| Conflict | "Someone just booked that time" (409) |
| Ineligible | "This time is reserved…" (403) |
| Cancelled | "Booking cancelled" and the slot shows as cancelled |

There is no calendar widget; slots are a simple list. This is deliberate: fewer UI states,
less chance of a misleading availability display.

## Booking rules

| Rule | Value | Enforcement |
|---|---|---|
| Booking window | 14 days (`BOOKING_WINDOW_DAYS`) | Query filter |
| Upcoming cap | 2 (`MAX_UPCOMING_BOOKINGS`) | Service check |
| Priority eligibility | latest tier ≥ `elevated` | UI filter + service check |
| Slot must be open and future | — | Pre-check + conditional update |
| Contact phone | Optional; validated if present | zod + seal |
| Reminder opt-in | Requires a phone number | `reminderOptIn = Boolean(phone && remind)` |
| Share check-in | Optional; requires a latest check-in | Service returns `no_checkin` if absent |

### Why priority eligibility is checked twice

The page hides priority slots from ineligible students, but a student could call the API
directly. `bookSlot` reloads the latest check-in and returns `not_eligible` (403) if the slot
is priority and the tier is below `elevated`. The UI check is convenience; the service check
is authority.

## Booking sequence

```text
POST /api/slots/{id}/book
  { share: boolean, phone?: string, remind?: boolean }
    │
    ├─ same-origin, student session, consent
    ├─ zod bookBody
    ├─ isUuid(id)
    ├─ bookSlot(pseudonym, id, opts)
    │     target = SELECT slot
    │     if !target || status !== open || starts_at <= now → taken (409)
    │     if target.is_urgent && latestTier < elevated → not_eligible (403)
    │     upcoming = count booked, starts_at > now
    │     if upcoming >= 2 → too_many (409)
    │     if share:
    │         latest = latestCheckin(p); if none → no_checkin (409)
    │         sharedCheckinId = latest.id
    │     UPDATE slots
    │       SET status='booked', booked_by=p, booked_at=now,
    │           shared_checkin_id=…, contact_enc=seal({phone}) or null,
    │           reminder_opt_in=…
    │     WHERE id=… AND status='open' AND starts_at > now
    │     RETURNING id
    │     if no row → taken (409)
    └─ 200 { ok: true }
```

The `UPDATE … WHERE status='open'` is the concurrency control. Two simultaneous requests can
both pass the pre-checks, but only one can transition the row.

## Sharing a check-in

- The checkbox appears only when the student has at least one check-in.
- Ticking it sets `shared_checkin_id` to the **latest** check-in at booking time. The student
  cannot choose an older one from this UI.
- The counsellor sees the shared check-in on the booking detail; opening it decrypts the
  payload and writes `view_booking`.
- Unticked → `shared_checkin_id = NULL`; the counsellor sees "The student chose not to share
  a check-in for this session."
- Cancelling or rescheduling clears or carries the pointer:
  - cancel clears it;
  - reschedule carries it to the new slot.

## Rescheduling

```text
POST /api/slots/{fromId}/reschedule { newSlotId }
  ├─ same-origin, student session, consent
  ├─ both UUIDs
  ├─ rescheduleBooking()
  │    if from === to → not_found
  │    if target is priority and ineligible → not_eligible
  │    transaction:
  │      SELECT from FOR UPDATE
  │        WHERE id=from AND booked_by=p AND status='booked' AND starts_at > now
  │      SELECT to FOR UPDATE
  │        WHERE id=to AND status='open' AND starts_at > now
  │      clear from (status open, null owner/contact/shared)
  │      book to with carried sharedCheckinId, contactEnc, reminderOptIn
  │      reset reminder attempt/sent timestamps
  │    audit(reschedule_booking, slot, to)
  └─ 200 | 403 | 404 | 409
```

The old slot is released only after the new one is secured, both inside one transaction.

## Cancelling

```text
POST /api/slots/{id}/cancel
  UPDATE slots SET <cleared>
   WHERE id=… AND booked_by=p AND status='booked' AND starts_at > now
```

`<cleared>` resets status, owner, timestamps, shared check-in, contact, reminder fields, and
attendance fields. A booked slot in the past cannot be cancelled by the student; staff can
mark attendance instead.

The counsellor can cancel any slot (`cancelSlotAsStaff`). A booked student sees it as
cancelled in their list. The counsellor action is audited.

## Reminders

Run every minute by the alerts cron:

| Window | Target | Selection |
|---|---|---|
| 24-hour | 22–26 h before start | `status='booked'`, `reminder_opt_in=true`, phone present, `reminder_24_sent_at IS NULL`, not attempted in the last 15 min |
| 2-hour | 1.5–2.5 h before start | same, using the 2-hour columns |

Message: `Reminder: your appointment is on <weekday, day month, time>.` No counsellor name, no
location, no reason. The SMS could appear on a lock screen or shared phone.

Mechanics:

- Phone is decrypted in memory from `contactEnc`, using `bookedBy` as AAD.
- A decryption failure skips the row (does not crash the job).
- Attempt timestamps record failures too; a 15-minute throttle prevents hot-looping.
- The phone is never written to the outbox.
- If no SMS transport is configured in production, the send fails; attempts are recorded and
  no reminder is delivered.

## Counsellor scheduling

`createSlots` accepts:

| Field | Range | Meaning |
|---|---|---|
| `firstStart` | future datetime | First slot, interpreted as IST by the action |
| `durationMinutes` | 15–120 | Length of each slot |
| `perDay` | 1–12 | Back-to-back slots on the first day |
| `weeks` | 1–12 | Repeat weekly |
| `location` | 1–120 chars | e.g. "Counselling Room, Student Activity Centre" |
| `mode` | `in_person` / `phone` / `video` | Session mode |
| `isUrgent` | boolean | Priority slot |

Generation:

```text
for w in 0..weeks-1:
  for i in 0..perDay-1:
    start = firstStart + w*7d + i*duration
    end   = start + duration
    insert slot(open)
```

No duplicate detection: creating overlapping schedules is possible. Counsellors are expected
to avoid it; the table shows existing upcoming slots.

### Public profile

`upsertCounsellor` sets display name (max 80), languages (max 160, free text), and bio (max
600). It is shown next to slots so students can choose a language match. Updating a profile is
audited (`update_counsellor`).

## Attendance

`markAttendance(slotId, actor, attended)`:

```sql
UPDATE slots
   SET attended_at = $now, no_show_at = NULL, marked_by = $actor   -- attended
    OR attended_at = NULL, no_show_at = $now, marked_by = $actor   -- no-show
 WHERE id = $slot AND status = 'booked' AND starts_at < now
RETURNING id;
```

- Only after the start time.
- Only for booked slots.
- Audited as `mark_attendance`.
- Drives the admin dashboard's attended/no-show metrics.

## Edge cases

| Case | Behaviour |
|---|---|
| Two students book simultaneously | One wins; the other gets 409 `taken` |
| Student books a third upcoming session | 409 `too_many` |
| Student shares but has no check-in | 409 `no_checkin`; UI hides the checkbox if none |
| Student tries a priority slot directly | 403 `not_eligible` |
| Student reschedules to the same slot | 404 `not_found` |
| Target slot taken during reschedule | 409 `taken`; original booking remains |
| Counsellor cancels a booked slot | Slot status `cancelled`; student sees it |
| Student cancels after start | 404 (no row updated) |
| SMS transport missing | Attempt recorded; no message |
| Phone decryption fails | Reminder skipped for that row |
| Timezone confusion | All `datetime-local` inputs are interpreted as IST (`+05:30`); display uses `Asia/Kolkata` |
| No open slots | Helpline alternatives shown, not a dead end |

## Data written

| Table | Fields |
|---|---|
| `slots` | status, booked_by, booked_at, shared_checkin_id, contact_enc, reminder_opt_in, reminder attempt/sent timestamps, attended_at, no_show_at, marked_by |
| `audit_log` | `create_slots`, `cancel_slot`, `view_booking`, `mark_attendance`, `reschedule_booking` |
| `notification_outbox` | none (reminders go directly via SMS) |

## Related reading

- [Booking and reminders domain](../03-domains/booking-and-reminders.md)
- [Counsellor workflow](counsellor-workflow.md)
- [db.md](../04-data/db.md)
- [API reference](../05-api/api-reference.md)
