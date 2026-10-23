# Data flow

This document traces how data moves through Aatman, where it is transformed, and what
crosses each boundary. Read it alongside [db.md](../04-data/db.md) and
[Privacy and crypto](../03-domains/privacy-and-crypto.md).

## Data classes

| Class | Examples | At rest | In transit | Who can read |
|---|---|---|---|---|
| **Identity** | Student email | Never stored; converted to pseudonym | TLS to IdP and app | IdP; app during sign-in |
| **Pseudonym** | `p_…` | `students.pseudonym`, FKs | TLS | App; operators with DB access |
| **Clinical content** | Answers, scores, tier, notes | AES-256-GCM per field (tier/timestamp plaintext) | TLS | Student; counsellor via explicit share |
| **Free text** | Check-in free text | **Never stored** | TLS to app | App in memory; crisis lexicon |
| **Chat text** | Chat turns | **Never stored** | TLS to app and LLM (scrubbed) | App; configured LLM provider |
| **Contact details** | Name, phone, email, best time | AES-256-GCM | TLS | Counsellors with audit |
| **Operational** | Slots, attendance, alerts, outbox, audit | Plaintext / encrypted notes | TLS | Staff; operators |
| **Aggregates** | Weekly counts, service metrics | Computed, not stored | TLS | Counsellors, admins |

## End-to-end map

```text
                    ┌──────────────────────────────┐
                    │ Institute IdP (Google/Entra) │
                    └──────────────┬───────────────┘
         email (verified claims)   │
                    ┌──────────────▼───────────────┐
                    │  App: pseudonymise(email)    │
                    │  HMAC-SHA256(PSEUDONYM_KEY)  │
                    └──────────────┬───────────────┘
                                   │ p_…
        ┌──────────────────────────┼────────────────────────────┐
        │                          │                            │
┌───────▼────────┐      ┌──────────▼─────────┐       ┌──────────▼─────────┐
│ Check-in       │      │ Chat               │       │ Booking            │
│ answers+text   │      │ browser transcript │       │ slot + contact     │
└───────┬────────┘      └──────────┬─────────┘       └──────────┬─────────┘
        │ triage()                 │ crisis check             │ conditional update
        │ drop free text           │ PII scrub                │
        ▼                          ▼                          ▼
┌────────────────┐        ┌────────────────┐         ┌────────────────┐
│ seal(payload)  │        │ LLM (optional) │         │ seal(contact)  │
│ AES-GCM + AAD  │        │ guard output   │         │ slot row       │
└───────┬────────┘        └────────┬───────┘         └───────┬────────┘
        │                          │ reply (ephemeral)       │
        ▼                          ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Postgres: encrypted payloads, tier/timestamps, slots, alerts, audit  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
     Alerts + outbox                 Aggregates (k≥10)
     → email webhook                 → admin dashboard
```

## Flow A — Sign-in and pseudonymisation

```text
Browser → GET /api/auth/login/google
  → app creates PKCE verifier, state, nonce
  → signed pending state in aat_o (10 min, path /api/auth/callback)
  → 302 to Google

Google → GET /api/auth/callback/google?code=…&state=…
  → verify aat_o, state, nonce
  → exchange code; receive ID token claims
  → evaluateIdentity():
       google: email_verified === true, hd ∈ ALLOWED_EMAIL_DOMAINS, domain allowed
       microsoft: tid === MICROSOFT_TENANT_ID, domain allowed
  → roleFor(email): admin | counsellor | student
  → student: pseudonym = HMAC(PSEUDONYM_KEY, email)
       insert students(pseudonym) ON CONFLICT DO NOTHING
       if consent cookie matches current version: store consent version/time
  → staff: audit(staff_login); session sub = staff:<email>
  → sign aat_s JWT; delete aat_o and aat_c
  → 303 to /checkin | /counsellor | /admin
```

**What the app retains:** the pseudonym and role. The email is not written to the database,
the cookie, or logs. Staff emails are intentionally retained for attribution and audit.

## Flow B — Check-in submission

```text
Browser                                  Server
───────                                  ──────
FlowState in memory + sessionStorage
toSubmission() prunes dead branches
POST /api/checkins {answers, campus, locale}
                                         isSameOrigin
                                         requireApi(student, consent)
                                         rateLimit(checkin:<p>, 10/h)
                                         zod checkinBody
                                         createCheckin():
                                           triage(answers)        ← re-score, ignore client
                                           toPublicTriage()        ← drop textDetection
                                           strip freeText
                                           seal({answers, campus, triage, locale}, p)
                                           BEGIN
                                             INSERT checkins
                                             if tier ∈ {crisis,urgent}:
                                               INSERT crisis_alerts
                                               recipients = on-call or ALERT_EMAILS
                                               INSERT notification_outbox (PII-free)
                                           COMMIT
201 {id, createdAt, triage}
```

Notes:

- The **client's triage result is ignored**. Only answers, campus answers, and locale are
  submitted; the server computes the authoritative tier.
- Free text is used for detection inside `triage()` and then excluded from the payload. It is
  not in the insert, not in logs, and not in the LLM path.
- The alert, outbox rows, and check-in are atomic. If the transaction fails, none exist.
- `tier` and `created_at` remain plaintext for aggregation; everything else is ciphertext.

## Flow C — Summary generation

```text
ResultsView (saved mode)
  → POST /api/checkins/{id}/summary
      → requireApi(student, consent)
      → getCheckin(p, id)             ← owner-scoped
      → if summaryEnc exists: return cached (no LLM call)
      → rateLimit(summary:<p>, 20/h)
      → summarize(triage, campus, locale)
          if no provider OR tier ∉ {mild,moderate} OR ragging OR campus.safety === "yes":
              return clinician template
          build scores-only user message (bands + boolean campus flags)
          provider.complete(system prompt, user JSON)
          if failure: template
          guardOutput(text, "summary")
          if blocked: template
          return {text, source:"llm"}
      → saveSummary(): seal(text), store source
  → render note; show "AI note" only when source = llm
```

**Boundary:** the LLM receives band labels and four booleans, never answers, scores,
pseudonym, locale-specific free text, or identity. The response is length-capped and scanned
for diagnosis, medication, links, unapproved phone numbers, and harm language.

## Flow D — Reflective chat

```text
ChatView (browser)
  user types message
  → detectCrisis(message) on device
      if level ≠ none → pause UI, show CrisisActions, no request
      if ragging      → pause UI, show anti-ragging helpline, no request
  → POST /api/chat {messages, locale}
      → requireApi(student, consent)
      → rateLimit(chat:<p>, 40/h)
      → reflect(history, locale)
          detectCrisisInAll(user turns)
            if hit → {type:"safety"} (no model call)
            if ragging → {type:"ragging"}
          if no provider → {type:"unavailable"}
          take last 12 turns; scrubPii() on user turns
          drop leading assistant turns
          provider.complete(reflect prompt)
          failure → fallback text
          guardOutput(text, "chat")
          blocked → fallback text
  → append reply in browser memory
```

**What is stored:** nothing. **What is logged:** provider error class/status only. **What the
LLM sees:** at most 12 recent turns, with emails, phones, URLs, IDs, room numbers, hostel
names, and names after titles/relationship words replaced with placeholders.

## Flow E — Crisis alert, escalation, delivery

```text
Check-in (crisis/urgent)
  └─ transaction:
       crisis_alerts {pseudonym, checkin_id, tier, status=open}
       notification_outbox rows:
         to: active on-call staff, else ALERT_EMAILS
         subject/body: tier + opaque alert URL only

Every minute: POST /api/cron/alerts (Bearer CRON_SECRET)
  ├─ runAlertEscalation()
  │    SELECT open, unacknowledged alerts FOR UPDATE SKIP LOCKED
  │    age ≥ threshold(s):
  │       crisis: 10 / 20 / 30 min
  │       urgent: 30 / 60 / 120 min
  │    level 1 → backup emails (or fallback)
  │    level 2 → CLINICAL_LEAD_EMAILS (or fallback)
  │    level 3 → ADMIN_EMAILS (or fallback)
  │    INSERT escalation outbox rows; set escalation_level
  ├─ processOutbox()
  │    reset stale 'sending' (>10 min)
  │    claim ≤20 due rows SKIP LOCKED
  │    send webhook outside transaction
  │    success → sent; failure → pending with backoff or dead after 5
  └─ runAppointmentReminders()
       neutral SMS for 24 h / 2 h windows
```

**Notification contents:** an alert id and staff URL. No student data. The alert row itself
contains no answers, scores, free text, or contact details until the student sends a contact
request, which links `contact_request_id`.

### Alert → callback linkage

```text
Student sends contact request
  → contact_requests row with encrypted contact details
  → UPDATE crisis_alerts SET contact_request_id = <new>
     WHERE pseudonym = p AND contact_request_id IS NULL
       AND status IN ('open','acknowledged')
```

A counsellor opening the alert sees "Callback shared" and a link to the request. Opening the
request decrypts details and writes an audit row.

## Flow F — Contact request

```text
ContactForm
  → POST /api/contact-requests {checkinId?, name?, phone?, email?, bestTime?, consent:true}
      → requireApi(student, consent)
      → zod contactBody (phone or email required)
      → createContactRequest()
          choose given check-in or latest (owner-scoped)
          cap: <3 open requests
          seal({name, phone, email, bestTime}, p)
          INSERT contact_requests (tier copied from check-in)
          link open alerts to this request
201 {id}
```

Counsellor read path:

```text
/counsellor/requests/{id}
  → requireStaffPage(["counsellor"])
  → getContactRequestForStaff(id, actor)
      → recordAudit(actor, view_contact_request, ...)
      → unseal(contactEnc, pseudonym)
      → getCheckin(pseudonym, checkinId) if linked
```

The queue list (`listContactRequests`) intentionally selects only id, date, tier, status, and
handler — no decryptable fields — so rendering the queue needs no audit.

## Flow G — Booking

```text
/book (server)
  → latestCheckin(p) → includeUrgent = tier ≥ elevated
  → listOpenSlots(now, {includeUrgent})  (next 14 days, status open)
  → listStudentBookings(p)               (ends_at > now)
  → render BookingView

BookingView confirm
  → POST /api/slots/{id}/book {share, phone, remind}
      → requireApi(student, consent)
      → readJson bookBody
      → bookSlot()
          target exists, open, future
          if isUrgent and latest tier < elevated → not_eligible (403)
          upcoming booked count < 2
          if share: latest check-in must exist → sharedCheckinId
          conditional UPDATE status='booked' WHERE status='open'
          contactEnc = seal({phone}) if phone
          reminderOptIn = phone && remind
```

Reminders read `contactEnc`, decrypt in memory, send a neutral SMS, and record attempt/sent
timestamps. The phone is never copied into `notification_outbox`.

## Flow H — Retention

```text
POST /api/cron/retention (Bearer CRON_SECRET)
  cutoff = now - RETENTION_MONTHS (default 12)
  auditCutoff = now - 36 months
  delete checkins where created_at < cutoff AND keep = false
  delete contact_requests where created_at < cutoff AND status = 'closed'
  delete slots where ends_at < cutoff
  delete crisis_alerts where status = 'resolved' AND resolved_at < cutoff
  delete notification_outbox where status ∈ {sent,dead} AND created_at < now-30d
  delete on_call_shifts where ends_at < now-90d
  delete rate_limits where window_start < now-24h
  audit(system, retention_run, counts JSON)
```

Cascades matter:

- Deleting a check-in sets `contact_requests.checkin_id` and `slots.shared_checkin_id` to
  `NULL` (sharing pointer disappears; the booking remains).
- Deleting a student cascades check-ins, contact requests, and alerts.

## Flow I — Export and erasure

```text
GET /api/me/export
  → requireApi(student)
  → exportStudentData(p)
      account (pseudonym, consent version/time)
      check-ins (decrypted answers, campus, scores, summary, keep)
      contact requests (decrypted contact)
      bookings (dates, location, mode, status, shared flag)
  → JSON attachment aatman-data.json

DELETE /api/me
  → requireApi(student)
  → eraseStudent(p)
      transaction:
        future booked slots → open, clear owner/shared/contact
        all remaining booked slots → clear owner/shared/contact
        delete students(p)  ← cascades check-ins, requests, alerts
      audit(student, student_erased)  ← no identifier
  → delete session cookie
```

## Flow J — Aggregates

```text
/admin (counsellor or admin)
  → weeklyTierCounts(12)
      SELECT date_trunc('week', created_at), tier, count(*) GROUP BY ...
      SELECT count(distinct pseudonym) per week
      suppress counts 1–9; complementary-suppress one more cell
  → serviceStats(28)
      slots offered/booked/attended/no-show in window
      contact requests count
      median hours request→contact (only if n ≥ 10)
  → render cells; "<10" for suppressed
```

Aggregation happens **at query time** from plaintext `tier` and timestamps. No per-student
data is returned to the page.

## Flow K — Offline and stateless

```text
Check-in submit
  ├─ stateless mode: triage locally, save to sessionStorage, /results/local
  └─ fetch throws TypeError (offline): same, reason "offline"

/results/local
  → LocalResults reads sessionStorage after mount
  → ResultsView with template summary; no contact API calls; banners say not saved

Service worker
  → /crisis precached at install
  → offline navigation to any other page → /crisis
  → exercises cached after first visit
  → API and personal pages never cached
```

## Boundary summary

| Data | Browser | App memory | Postgres | LLM | Email/SMS | Logs |
|---|---|---|---|---|---|---|
| Email | IdP redirect | transient | ❌ | ❌ | ❌ | ❌ |
| Pseudonym | cookie | yes | yes | ❌ | ❌ | rarely (ids only) |
| Answers | memory/draft | yes | ciphertext | ❌ | ❌ | ❌ |
| Free text | memory | yes (scan) | ❌ | ❌ | ❌ | ❌ |
| Summary | page | yes | ciphertext | scores only | ❌ | ❌ |
| Chat | memory | yes | ❌ | scrubbed | ❌ | ❌ |
| Contact details | form | yes | ciphertext | ❌ | ❌ | ❌ |
| Phone for SMS | ❌ | decrypt | ciphertext | ❌ | SMS body has time only | last 4 digits in dev |
| Alert id/tier | staff UI | yes | plaintext | ❌ | email body | ids only |
| Audit rows | ❌ | yes | plaintext ids | ❌ | ❌ | indirect |
| Aggregates | staff UI | yes | computed | ❌ | ❌ | ❌ |

## Related reading

- [Privacy and crypto](../03-domains/privacy-and-crypto.md)
- [Alerts and escalation](../03-domains/alerts-and-escalation.md)
- [Retention and erasure](../03-domains/retention-and-erasure.md)
- [Crisis flow](../02-flows/crisis.md)
- [db.md](../04-data/db.md)
