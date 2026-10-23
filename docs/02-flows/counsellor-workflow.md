# Counsellor workflow

## Purpose

The counsellor portal is a queue-and-action interface, not a student management system. It
shows only students who explicitly asked for contact or shared a check-in with a booking. It
has no search, no roster, and no bulk export.

## Navigation

| Path | Purpose |
|---|---|
| `/counsellor` | Contact-request queue + upcoming booked sessions |
| `/counsellor/requests/{id}` | One request: callback details + shared check-in + status controls |
| `/counsellor/alerts` | Open/acknowledged crisis alerts + on-call rota |
| `/counsellor/alerts/{id}` | One alert: acknowledge, resolve, optional encrypted note |
| `/counsellor/bookings/{id}` | One booking: shared check-in + attendance |
| `/counsellor/slots` | Public profile, slot creation, upcoming slots |
| `/admin` | Aggregate dashboard |

The staff shell shows the signed-in email and a sign-out form. Alerts show a count badge in
the navigation.

## Daily workflow

```text
Start of shift
  ├─ check Alerts (crisis first, oldest first)
  │    ├─ acknowledge everything you are taking
  │    ├─ follow the escalation SOP
  │    └─ resolve with a handover note
  ├─ check Contact requests (severity, then newest)
  │    ├─ open request → audit row
  │    ├─ contact the student
  │    ├─ mark contacted
  │    └─ close when done
  ├─ check today's booked sessions
  │    ├─ open booking → shared check-in if any
  │    ├─ after the session: mark attended or no-show
  └─ maintain slots and on-call rota for the coming week
```

## Contact requests

### Queue

`listContactRequests(["new", "contacted"])` selects only id, created time, tier, status, and
handler. No decryption is needed to render the queue, so no audit row is written just for
viewing the list. Sort order: severity (`crisis` → `mild`), then newest.

Each row shows:

- tier badge
- creation time
- "New" or "Contacted by {email}"

### Detail

`getContactRequestForStaff(id, actor)`:

1. Loads the request.
2. Writes `view_contact_request`.
3. Decrypts `contact_enc` with the student's pseudonym as AAD.
4. Loads the shared check-in if `checkin_id` is present.

The page shows:

- name the student gave (optional)
- phone as a `tel:` link
- email as a `mailto:` link
- best time
- status and handler
- shared check-in (tier, reasons, scores, item-level answers, C-SSRS, campus answers)
- status buttons: Mark contacted, Close, Reopen

### Status transitions

```text
new ──► contacted ──► closed
 │                        │
 └──────── contacted ◄────┘ (reopen)
```

`updateContactRequestStatus` sets `handled_by`, `contacted_at` on first contact, `closed_at` on
close, and writes `update_contact_request`. There is no enforced state machine beyond the
buttons; the service accepts any of the three statuses.

### Limits

- A student can have at most 3 open requests (`new` + `contacted`).
- A request requires an existing check-in.
- The request copies the tier at creation time; later re-scoring does not change it.

## Crisis alerts

See [Crisis flow](crisis.md) for the student side and escalation ladder.

### Queue

- `open` + `acknowledged` only.
- Crisis first, then oldest.
- Age, timestamp, acknowledgement, escalation level, callback badge.
- Acknowledgement button for `open` alerts.
- Three operational warnings: no recipients, no active shift, no email transport.

### Detail

- No answers or identity. If a contact request is linked, a button opens it.
- Acknowledge.
- Resolve with an optional note (max 2000 chars), encrypted with the student's pseudonym.
- A previous note is shown if one exists.

### On-call rota

Counsellors can add shifts:

| Field | Rule |
|---|---|
| Staff email | valid email |
| Role | `counsellor` or `clinical_lead` |
| Start/end | IST; end after start; max 7 days |
| Backup email | optional |

Alerts go to staff whose shift covers the moment. If none, `ALERT_EMAILS`. Escalation level 1
uses the active shift's backup email; levels 2 and 3 use clinical lead and admin lists.

## Booked sessions

### List

`listStaffSlots()` returns upcoming slots with status `open` or `booked`, plus a `shared`
boolean and `booked` boolean. The home page filters to `booked` and shows:

- date/time
- location
- "Check-in shared" or "Not shared"

### Detail

`getBookingForStaff(slotId, actor)`:

1. Loads the slot and counsellor profile.
2. Writes `view_booking`.
3. Decrypts the phone from `contact_enc` if present.
4. Loads the shared check-in if `shared_checkin_id` is set.

The page shows:

- full date/time, location, mode
- phone for rescheduling
- shared check-in or "chose not to share"
- attendance controls when the session has started and is still `booked`

### Attendance

Only available after `starts_at`. Attended and no-show are mutually exclusive; marking one
clears the other. Audited.

## Slot management

### Public profile

Display name, languages, bio. Shown to students next to slots. Saved with
`upsertCounsellor`, audited.

### Create slots

Form fields and generation are described in [Booking flow](booking.md#counsellor-scheduling).
The action converts `datetime-local` to IST (`+05:30`).

### Cancel slots

Any upcoming slot can be cancelled. A booked student sees the cancellation in their list.
Audited as `cancel_slot`.

### What is not supported

- Editing an existing slot's time or location (cancel and recreate).
- Deleting a slot.
- Per-counsellor permission scoping: every counsellor can see and manage every slot.
- Duplicate/overlap detection.

## Server actions reference

All in `src/app/(staff)/actions.ts`, all begin with `requireCounsellor()`:

| Action | Form fields | Service | Revalidates |
|---|---|---|---|
| `setRequestStatus` | id, status | `updateContactRequestStatus` | `/counsellor`, request detail |
| `createSlotsAction` | start, duration, perDay, weeks, location, mode, isUrgent | `createSlots` | `/counsellor/slots` |
| `upsertProfileAction` | displayName, languages, bio | `upsertCounsellor` | `/counsellor/slots`, `/book` |
| `markAttendanceAction` | id, attended (`yes`/`no`) | `markAttendance` | `/counsellor`, booking detail |
| `cancelSlotAction` | id | `cancelSlotAsStaff` | `/counsellor/slots` |
| `acknowledgeAlertAction` | id | `acknowledgeAlert` | alerts list + detail |
| `resolveAlertAction` | id, note | `resolveAlert` | alerts list + detail |
| `createOnCallAction` | staffEmail, role, start, end, backupEmail | `createOnCallShift` | `/counsellor/alerts` |

Input is parsed with zod. Invalid UUIDs or enums throw before any service call.

## Audit trail

| Action | Trigger |
|---|---|
| `view_contact_request` | Opening a request detail |
| `view_booking` | Opening a booking detail |
| `view_alert` | Opening an alert detail |
| `update_contact_request` | Changing request status |
| `acknowledge_alert` | Acknowledging |
| `resolve_alert` | Resolving |
| `create_on_call` | Adding a shift |
| `create_slots` | Creating slots |
| `cancel_slot` | Cancelling a slot |
| `mark_attendance` | Marking attended/no-show |
| `reschedule_booking` | Student reschedule (actor `student`) |
| `update_counsellor` | Profile change |
| `staff_login` | Staff sign-in |

The audit row records actor, action, target type, and target id — never content.

## Operational expectations

These are human processes the software supports but cannot enforce:

- **Acknowledge before working an alert.** Acknowledgement stops escalation.
- **Resolve with a handover note** at the end of a shift.
- **Keep the rota populated.** Without a shift, alerts fall back to a shared list.
- **Do not share screenshots or exports** of student data outside approved channels.
- **Use neutral contact** (no identifying details in SMS or voicemail).
- **Escalation SOP** must define night/weekend/holiday coverage; the code's default escalation
  target is the clinical lead, then admin/fallback.

See [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md) for the SOP and rota gates.

## Failure handling

| Failure | What the counsellor sees |
|---|---|
| No open requests | "No open requests." |
| Deleted check-in | "The check-in was deleted." |
| Decryption failure | Request/booking page errors; check keys and AAD |
| No recipients configured | Red warning on alerts page |
| No active shift | Banner naming fallback recipients |
| No email transport in production | Red warning: nobody paged outside dashboard |
| Slot already taken | Student gets 409; counsellor list refreshes |

## Related reading

- [Crisis flow](crisis.md)
- [Booking flow](booking.md)
- [Alerts and escalation](../03-domains/alerts-and-escalation.md)
- [Audit and aggregates](../03-domains/audit-and-aggregates.md)
- [API reference](../05-api/api-reference.md)
