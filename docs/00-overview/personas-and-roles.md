# Personas and roles

## Role model

There are exactly three application roles, resolved from server-side allow-lists at sign-in:

```ts
type Role = "student" | "counsellor" | "admin";
```

The role is embedded in the signed session cookie and is never accepted from the client.
There is no self-service role change, invitation flow, or role management UI.

| Role | Assigned by | Session subject | Email in session? |
|---|---|---|---|
| `student` | Any verified email on an allowed domain | HMAC pseudonym (`p_…`) | **No** |
| `counsellor` | `COUNSELLOR_EMAILS` allow-list | `staff:<email>` | Yes |
| `admin` | `ADMIN_EMAILS` allow-list | `staff:<email>` | Yes |

Precedence: `admin` wins over `counsellor` if an address appears in both lists
(`src/lib/auth/identity.ts` → `roleFor`).

> **Clinical lead** is not an application role. It is an escalation target
> (`CLINICAL_LEAD_EMAILS`) and the human authority for clinical sign-off. A clinical lead
> who needs the counsellor UI must also be in `COUNSELLOR_EMAILS`.

---

## Student

**Context.** An NIT Patna student, 18 or older, signing in with an institute account. May be
in acute distress, may be curious, may be checking in at 2 a.m. on hostel Wi-Fi that keeps
dropping. Language may be English, Hindi, or Hinglish (chat input).

**Goals.** Understand how they are doing without being labelled; get help without being
exposed; keep control of who sees what.

**Capabilities**

- Complete a check-in, saved or stateless.
- See tier-appropriate results, scores, tips, and next steps.
- Download a calendar reminder (`.ics`).
- Book, reschedule, or cancel counselling sessions.
- Send a contact request with callback details.
- Chat with the reflective companion (when an LLM is configured).
- Use exercises, including offline after first load.
- View history, keep selected check-ins, export all data, erase everything.
- Use quick exit and access the crisis page at any time, including offline.

**Limits**

- Cannot see another student's data.
- Cannot open `/counsellor/*` or `/admin`.
- Cannot bypass consent: API routes require the current consent version.
- Cannot send free text to storage or an LLM: it is scanned and dropped.
- Under 18: no account, no server-side persistence.

**Design implications**

- One question per screen, skippable, progress visible, draft survives reloads.
- Neutral language, no diagnostic labels, no red-alert styling for moderate results.
- Crisis affordances are always one tap away in the header.
- Failure mode is local results, never a dead end.

---

## Counsellor

**Context.** A licensed campus counsellor. Sees students who explicitly asked for contact or
shared a check-in with a booking. Works a queue, manages availability, and may be on call for
crisis alerts.

**Goals.** Reach the right student quickly, with enough context to prepare, without gaining
surveillance access to the student body.

**Capabilities**

- View the contact-request queue (most severe first).
- Open a request: decrypts contact details and the shared check-in; **writes an audit row**.
- Move a request through `new → contacted → closed` (and reopen).
- View open crisis/urgent alerts; acknowledge and resolve with an encrypted note.
- View booked sessions; see the shared check-in and callback phone if provided.
- Mark attendance after the session start time.
- Create recurring slots, including priority slots; cancel slots.
- Maintain a public profile (display name, languages, bio) shown with slots.
- Create on-call shifts. All counsellors can create shifts; this is an operational trust
  boundary, not a per-user permission.
- View the aggregate dashboard (the `/admin` page allows both `admin` and `counsellor`).

**Limits**

- No search for a student by email, pseudonym, or roll number.
- No access to unshared check-ins.
- No access to admin-only distinctions — there are none; admin has *less* data access.
- Cannot see a student's identity, only what the student typed into a contact request.
- Cannot see free text from a check-in (never stored).
- Cannot see chat transcripts (never stored).

**Operational expectations**

- Work the alert queue within the escalation ladder: crisis at 10/20/30 minutes; urgent at
  30/60/120 minutes (see [Alerts and escalation](../03-domains/alerts-and-escalation.md)).
- Keep the on-call rota populated. With no active shift, alerts fall back to `ALERT_EMAILS`.
- Treat every opened record as an auditable event.

---

## Admin

**Context.** Dean of Students office, counselling-cell administrator, or institute IT.
Accountable for service-level reporting, not casework.

**Goals.** Know whether the service is reaching students and functioning, without seeing
individuals.

**Capabilities**

- Aggregate wellbeing dashboard: weekly check-in counts, distinct students, counts by tier,
  slots offered/booked, attended/no-show, contact requests, median hours to first contact.
- Everything a counsellor can do *only if also listed in `COUNSELLOR_EMAILS`*. The `admin`
  role by itself routes to `/admin` and does not grant counsellor pages.

**Limits**

- No route in the application returns an individual student's row to an admin.
- Aggregates suppress counts 1–9 and a complementary cell so a small count cannot be derived
  from the row total.
- Median time-to-contact is withheld below 10 contacted requests.

**Design rationale.** Admin is intentionally the *least* data-privileged staff role. The
person with the broadest operational authority should not also have the broadest data access.

---

## Clinical lead

**Context.** Licensed counsellor or psychiatrist accountable for clinical safety.

**Responsibilities (not software roles)**

- Approve tier thresholds, C-SSRS mapping, result copy, templates, and LLM prompts.
- Review the crisis lexicon and grow the golden set.
- Approve validated Hindi instruments.
- Own the escalation SOP and participate in tabletop drills.
- Receive level-2 escalations (`CLINICAL_LEAD_EMAILS`).

See [clinical-review.md](../clinical-review.md) and
[LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md).

> A clinical lead without a `COUNSELLOR_EMAILS` entry can receive escalation email but cannot
> open the staff UI. This is deliberate least-privilege; add the address to the counsellor
> list if UI access is required.

---

## Operator / SRE

**Context.** Institute IT or a contracted operator running the VPS.

**Capabilities**

- Deploy releases, apply migrations, roll back code (not schema).
- Read application logs, health checks, container state.
- Run backups and restores.
- Hold infrastructure secrets: database credentials, `CRON_SECRET`, SSO client secrets.

**Boundaries**

- Holds `DATA_ENCRYPTION_KEY` and `PSEUDONYM_KEY` in the server environment. This means an
  operator *can* decrypt data with sufficient effort; the privacy model protects against
  database dumps and accidental exposure, not a malicious root operator. This is stated
  explicitly in [privacy-and-crypto.md](../03-domains/privacy-and-crypto.md).
- Logs are designed to contain no student content. Do not add request-body logging.
- Backups contain ciphertext only, but must still be stored off-server.

See [Runbook](../06-operations/runbook.md).

---

## DPO / ethics committee

**Context.** Data Protection Officer, institute ethics committee, or legal reviewer.

**Needs**

- A data inventory: what is stored, in what form, who can read it, for how long.
- Lawful basis and consent mechanics, including minors.
- Technical and organisational controls.
- Breach-relevant facts: what a stolen database actually reveals.

**Where to look**

- [privacy-and-security.md](../privacy-and-security.md) — short DPO-facing overview.
- [Privacy and crypto](../03-domains/privacy-and-crypto.md) — technical enforcement.
- [Retention and erasure](../03-domains/retention-and-erasure.md) — lifecycle.
- [db.md](../04-data/db.md) — exact stored fields.
- [Data flow](../01-architecture/data-flow.md) — where data crosses boundaries.
- [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md) — legal gates before launch.

---

## Capability matrix

Legend: ✅ allowed · ❌ denied · ➖ not applicable · 🔒 allowed with audit row · 🧮 aggregate only

| Capability | Student | Counsellor | Admin | Operator |
|---|---|---|---|---|
| Take a check-in | ✅ | ➖ | ➖ | ➖ |
| Read own check-in | ✅ | ➖ | ➖ | ❌ |
| Read a shared check-in | ➖ | 🔒 | ❌ | ❌ |
| Read unshared check-in | ➖ | ❌ | ❌ | ❌ |
| Read free text | ❌ (never stored) | ❌ | ❌ | ❌ |
| Read chat transcript | ❌ (browser only) | ❌ | ❌ | ❌ |
| See own contact details | ✅ | ➖ | ➖ | ❌ |
| See student contact details | ➖ | 🔒 | ❌ | ❌ |
| See crisis alerts | ➖ | ✅ | ❌ | ❌ |
| Acknowledge/resolve alerts | ➖ | 🔒 | ❌ | ❌ |
| Book/reschedule/cancel own session | ✅ | ➖ | ➖ | ➖ |
| Manage any slot | ➖ | ✅ | ❌ | ❌ |
| View aggregate dashboard | ➖ | ✅ | ✅ | ❌ |
| View individual analytics | ➖ | ❌ | ❌ | ❌ |
| Export own data | ✅ | ➖ | ➖ | ➖ |
| Erase own data | ✅ | ➖ | ➖ | ➖ |
| Erase someone else's data | ❌ | ❌ | ❌ | ❌ (DB access only) |
| Deploy / migrate / restore | ❌ | ❌ | ❌ | ✅ |
| Read application logs | ❌ | ❌ | ❌ | ✅ |
| Rotate secrets | ❌ | ❌ | ❌ | ✅ (with key-loss consequences) |

### Enforcement points

| Rule | Enforced in |
|---|---|
| Role from allow-list, not client | `src/lib/auth/identity.ts` |
| Page-level role check | `src/lib/auth/guards.ts` (`requireStudentPage`, `requireStaffPage`) |
| API role + consent check | `src/lib/auth/guards.ts` (`requireApi`) |
| Row ownership on every student query | Services filter by `pseudonym` |
| Counsellor access requires opt-in | `getContactRequestForStaff`, `getBookingForStaff` |
| Audit on staff read | `recordAudit` inside those services |
| Aggregate suppression | `src/lib/services/aggregates.ts` |

## Persona-driven design decisions

| Persona need | Decision |
|---|---|
| Student fears exposure | Store a pseudonym, encrypt content, no identity columns |
| Student in crisis needs speed | `/crisis` is static and precached; one-tap `tel:` links |
| Counsellor needs context | Share one check-in per request/booking, not a history feed |
| Counsellor needs triage order | Queue sorted by severity then recency |
| Admin needs reporting | Pre-aggregated cells with suppression at query time |
| DPO needs minimal blast radius | Field encryption bound to owner; no free text at rest |
| Operator needs safe deploys | Stateless replicas, health-gated rolling release, forward-only migrations |
