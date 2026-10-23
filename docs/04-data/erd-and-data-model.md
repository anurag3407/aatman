# ERD and data model

## Entity-relationship diagram

```text
                          ┌─────────────────────────┐
                          │       students          │
                          │─────────────────────────│
                          │ pseudonym        PK     │
                          │ created_at              │
                          │ consent_version         │
                          │ consent_at              │
                          └───────────┬─────────────┘
                                      │ 1
              ┌───────────────────────┼────────────────────────┐
              │ N                     │ N                      │ N
   ┌──────────▼──────────┐  ┌─────────▼───────────┐  ┌─────────▼──────────┐
   │      checkins       │  │  contact_requests   │  │  crisis_alerts     │
   │─────────────────────│  │─────────────────────│  │────────────────────│
   │ id              PK  │  │ id              PK  │  │ id             PK  │
   │ pseudonym       FK  │  │ pseudonym       FK  │  │ pseudonym      FK  │
   │ created_at          │  │ checkin_id      FK  │◄─│ checkin_id     FK  │
   │ tier                │  │ created_at          │  │ contact_request_id │
   │ payload_enc         │  │ tier                │  │ created_at         │
   │ summary_enc         │  │ contact_enc         │  │ tier               │
   │ summary_source      │  │ status              │  │ status             │
   │ keep                │  │ handled_by          │  │ escalation_level   │
   └──────────┬──────────┘  │ contacted_at        │  │ note_enc           │
              │             │ closed_at           │  └─────────┬──────────┘
              │             └─────────────────────┘            │
              │ 1                                              │
              │ N                                              │ N
   ┌──────────▼──────────┐                          ┌──────────▼──────────┐
   │        slots        │                          │ notification_outbox │
   │─────────────────────│                          │─────────────────────│
   │ id              PK  │                          │ id              PK  │
   │ counsellor_email    │──────┐                   │ kind                │
   │ starts_at, ends_at  │      │                   │ to_email            │
   │ location, mode      │      │                   │ subject, body       │
   │ status              │      │                   │ status, attempts    │
   │ booked_by       FK  │      │                   │ next_attempt_at     │
   │ shared_checkin_id FK│      │                   └─────────────────────┘
   │ contact_enc         │      │
   │ is_urgent           │      │        ┌─────────────────────┐
   │ reminder_*          │      └───────►│     counsellors     │
   │ attendance          │  logical      │─────────────────────│
   └─────────────────────┘  (email)      │ email           PK  │
                                        │ display_name        │
   ┌─────────────────────┐              │ languages, bio      │
   │     audit_log       │              │ active              │
   │─────────────────────│              └─────────────────────┘
   │ id              PK  │
   │ at, actor, action   │              ┌─────────────────────┐
   │ target_type/id      │              │    rate_limits      │
   └─────────────────────┘              │─────────────────────│
                                        │ key             PK  │
   ┌─────────────────────┐              │ window_start        │
   │   on_call_shifts    │              │ count               │
   │─────────────────────│              └─────────────────────┘
   │ id              PK  │
   │ staff_email, role   │
   │ starts_at, ends_at  │
   │ backup_email        │
   └─────────────────────┘
```

## Ownership model

```text
Student owns:
  ├── checkins            (cascade)
  ├── contact_requests    (cascade)
  ├── crisis_alerts       (cascade)
  └── slots.booked_by     (set null)

Check-in is referenced by:
  ├── contact_requests.checkin_id     (set null)
  ├── slots.shared_checkin_id         (set null)
  └── crisis_alerts.checkin_id        (set null)

Contact request is referenced by:
  └── crisis_alerts.contact_request_id (set null)
```

The pseudonym is the **only** link between a person and their data. Everything else is a
record id.

## Cardinalities

| Relationship | Cardinality | Notes |
|---|---|---|
| Student → check-ins | 1 : N | Longitudinally many |
| Student → contact requests | 1 : N | Max 3 open at a time |
| Student → alerts | 1 : N | One per crisis/urgent check-in |
| Student → booked slots | 1 : N | Max 2 upcoming |
| Check-in → contact requests | 1 : N | A check-in can be shared by more than one request over time |
| Check-in → shared slots | 1 : N | The same latest check-in can be shared with multiple bookings |
| Check-in → alerts | 1 : 0..1 | Alerts are created with the check-in; one alert per check-in in practice |
| Contact request → alerts | 1 : N | All open alerts for that pseudonym link to the newest request |
| Counsellor → slots | 1 : N | Logical email match, not FK |
| Alert → outbox | 1 : N | Initial + escalation messages |
| On-call shift → recipients | N : N (logical) | Emails copied to outbox |

## Lifecycles

### Student

```text
first sign-in
  → INSERT students(pseudonym) ON CONFLICT DO NOTHING
  → consent recorded/updated
  → check-ins, requests, alerts, bookings accumulate

erasure
  → free future bookings
  → clear booking owner/contact/shared on all bookings
  → DELETE students
  → cascade check-ins, requests, alerts
```

### Check-in

```text
create (server re-score)
  → stored with tier + encrypted payload
  → optional summary cached
  → if crisis/urgent: alert + outbox
  → keep flag optional
  → retention deletes after 12 months unless kept
  → erasure deletes immediately
```

### Contact request

```text
create (student opt-in)
  → new
  → contacted (sets contacted_at, handler)
  → closed (sets closed_at)
  → reopen possible
  → retention deletes 12 months after creation if closed
  → erasure cascades
```

### Alert

```text
create (open)
  → escalation levels 1..3 while unacknowledged
  → acknowledged (stops escalation)
  → resolved (optional encrypted note)
  → retention deletes 12 months after resolution
  → erasure cascades
```

### Slot

```text
create (open)
  → booked (conditional update)
  → cancelled (student cancel → open; staff cancel → cancelled)
  → attended / no-show recorded after start
  → retention deletes after end + cutoff
```

## Encryption boundaries

```text
PLAINTEXT                          ENCRYPTED (AES-GCM, AAD = pseudonym)
─────────────────────────────      ──────────────────────────────────────
students.pseudonym                 checkins.payload_enc
students.created_at                checkins.summary_enc
checkins.tier                      contact_requests.contact_enc
checkins.created_at                slots.contact_enc
checkins.keep                      crisis_alerts.note_enc
contact_requests.tier/status
crisis_alerts.tier/status/times
slots metadata/status/times
counsellors.*
audit_log.* (ids only)
notification_outbox.* (PII-free)
rate_limits.key (hashed)
```

## Access paths

| Query | Filter | Index |
|---|---|---|
| Student history | `pseudonym` + order by `created_at` | `checkins_owner_idx` |
| Latest check-in | `pseudonym` + order + limit 1 | `checkins_owner_idx` |
| Counsellor request queue | `status IN (...)` | `contact_requests_status_idx` |
| Request detail | `id` | PK |
| Alert queue | `status IN (...)` | `crisis_alerts_open_idx` |
| Alerts for callback link | `pseudonym`, status, `contact_request_id IS NULL` | `crisis_alerts_pseudonym_idx` |
| Active on-call | time window | `on_call_window_idx` |
| Due outbox | `status`, `next_attempt_at` | `outbox_due_idx` |
| Open slots | `status`, time window | `slots_time_idx` |
| Student bookings | `booked_by`, time | `slots_booker_idx` |
| Weekly aggregates | `created_at` | `checkins_created_idx` |
| Retention deletes | time columns | relevant time indexes |
| Audit review | `at` | `audit_log_at_idx` |

## Invariants and where they live

| Invariant | Enforcement |
|---|---|
| One student row per email pseudonym | PK + `ON CONFLICT DO NOTHING` |
| Student queries are owner-scoped | Service `WHERE pseudonym` |
| One check-in per alert | Created together in a transaction |
| Alert has no content | Schema shape |
| Outbox has no student data | Message builder + contract |
| One booking wins a slot race | Conditional update |
| Reschedule is atomic | Transaction + row locks |
| One active attendance state | Mutually exclusive columns set together |
| Free text never stored | Service strips before sealing |
| Contact details encrypted | Service seals before insert |
| Small aggregates suppressed | Service, k = 10 |
| Retention respects `keep` | Delete predicate |
| Erasure leaves no student row | Transaction + cascade |

## Why plaintext tier/timestamp

Aggregates and operations need to filter and count without decrypting every payload. Encrypting
them would require a separate aggregate store or decrypting all rows per dashboard request.
The accepted leak is metadata: a dump shows that some pseudonym had a crisis check-in at a
time. There is no content in that fact.

## Why no soft delete

- Student erasure must be real.
- Retaining deleted rows would defeat the privacy claim.
- Operational history is preserved through aggregate counts and audit ids, not full records.
- Past slots remain ownerless for attendance metrics until retention removes them.

## Why `SET NULL` rather than cascade for pointers

A shared check-in is content; a booking and an alert are operations. Deleting the content
should not erase the fact that a session was booked or an alert was raised. `SET NULL` removes
the pointer and keeps the operational record.

## Why no FK on `counsellor_email`

Slots were originally created with an email column before a counsellor profile table existed.
A hard FK would reject slots for a counsellor who has not yet created a profile, and would
complicate legacy rows. The LEFT JOIN tolerates a missing profile.

## Data volume assumptions (pilot)

| Table | Expected growth | Notes |
|---|---|---|
| `checkins` | N students × a few per term | Indexed by owner and time |
| `slots` | tens per week per counsellor | Retention prunes |
| `contact_requests` | a few per week | Small |
| `crisis_alerts` | a few per week | High operational importance |
| `notification_outbox` | a few per alert | 30-day retention |
| `audit_log` | several rows per staff action | 36-month retention |
| `rate_limits` | one row per active key/window | 24-hour sweep |
| `students` | one per student | Not pruned |

No partitioning, sharding, or read replicas are needed at this scale. The schema is designed
for correctness and privacy first.

## Related reading

- [db.md](db.md)
- [Migrations](migrations.md)
- [Privacy and crypto](../03-domains/privacy-and-crypto.md)
- [Backend architecture](../01-architecture/backend-architecture.md)
