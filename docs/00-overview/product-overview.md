# Product overview

## One paragraph

Aatman is a web app for NIT Patna students to check in on their mental wellbeing. A student
answers a short, branching set of validated screening questions in English or Hindi. Plain,
deterministic code scores the answers and assigns one of five support tiers. The app then
shows the student what to do next: self-care and exercises for low tiers, a counsellor
booking and callback request for moderate tiers, and one-tap crisis lines for elevated and
above. An LLM may write a short warm note — but only from scores, only for low tiers, and
only after an output guard. It never diagnoses and never decides risk.

## The problem

Campus counselling capacity is scarce and unevenly reached. Students who most need help are
often the least likely to walk into a counselling office: stigma, uncertainty about whether
their problem is "serious enough", not knowing the language of mental health, and fear that
their answers will reach faculty or parents. A paper screening form does not solve any of
those problems and creates a new one — a durable record of distress.

Aatman is designed around three constraints:

1. **Reach students early** with a low-friction, low-stimulation check-in.
2. **Never miss acute risk** — recall matters more than precision.
3. **Collect as little personal data as possible** while still enabling a counsellor to help
   when the student asks.

## What the system does

| Capability | Behaviour | Primary code |
|---|---|---|
| Branching check-in | PHQ-2, GAD-2, always PHQ-9 item 9, conditional C-SSRS, campus questions, optional free text | `src/lib/checkin/flow.ts` |
| Deterministic scoring | PHQ-2/9, GAD-2/7, WHO-5, C-SSRS with published cutoffs and proration rules | `src/lib/scales/` |
| Safety gate | Five tiers, reason codes, early stop on high risk, server re-scoring | `src/lib/safety/triage.ts` |
| Crisis detection | Deterministic multilingual lexicon over free text; ragging detected separately | `src/lib/safety/crisisDetector.ts` |
| Low-tier note | Scores-only LLM summary, output-guarded, with clinician-written template fallback | `src/lib/llm/` |
| Crisis response | One-tap Tele-MANAS/112, crisis page, alert to on-call staff, escalation | `src/lib/services/alerts.ts` |
| Counsellor access | Contact request or booking-with-sharing; audit-logged; encrypted contact details | `src/lib/services/contactRequests.ts`, `booking.ts` |
| Booking | 14-day slot window, 2 upcoming bookings max, priority slots, reminders, reschedule | `src/lib/services/booking.ts`, `reminders.ts` |
| Reflective chat | Stateless, browser-only transcript, crisis check before the model, PII scrub, guard | `src/components/ChatView.tsx`, `src/lib/llm/index.ts` |
| Calming exercises | Box breathing, 5-4-3-2-1 grounding, sleep basics, CBT thought record | `src/components/exercises/` |
| Privacy rights | JSON export, full erasure, keep flag, automatic retention | `src/lib/services/studentData.ts`, `retention.ts` |
| Admin analytics | Weekly tier counts and service metrics with k ≥ 10 suppression | `src/lib/services/aggregates.ts` |
| Offline safety | Precached `/crisis`, cached exercises, offline check-in fallback | `public/sw.js`, `src/app/crisis/` |
| Minor mode | Under-18 no-account mode; nothing leaves the device | `src/components/ConsentForm.tsx`, `checkin?mode=stateless` |

## What the system explicitly does not do

These are product boundaries, not missing features:

- **It does not diagnose.** Result copy says "your answers suggest"; no diagnostic labels are
  shown to students. Band codes are internal.
- **It is not a crisis service.** The app cannot call anyone, and no human watches it in real
  time. The crisis page states this plainly. Alerts are a best-effort bridge to staffed
  humans, not a monitored emergency channel.
- **It does not replace a counsellor.** Chat is reflective, not therapeutic treatment.
- **It does not store student identity.** No name, email, roll number, or hostel is stored.
- **It does not send student data to an LLM by default.** Default `LLM_PROVIDER=none`; all
  features still work with templates.
- **It does not show admins individual records.** Admins only see k-anonymous aggregates.
- **It does not collect data from under-18s.** The minor path is stateless by design.

## Product principles

### 1. Safety is code, not a prompt

Risk classification is a pure function. It runs in the browser so it works offline and again
on the server so a tampered client cannot downgrade risk. The LLM sits *after* the safety
gate and only for tiers where its output cannot change what support is shown.

### 2. Least data, by construction

The system is designed so that a full database dump reveals tiers, timestamps, and staff
operational metadata — not answers, scores, notes, contact details, or identity. Free text
and chat are transient. This is enforced by schema shape and encryption, not policy alone.

### 3. The student controls disclosure

A counsellor sees check-in content only when the student sends a contact request or books
with sharing enabled. There is no "counsellor can look up a student" path.

### 4. Calm by default

The interface avoids alarm styling except where urgency is the correct signal. Copy is
plain, warm, and non-clinical. The app name and tab title are neutral. Quick exit clears
local state and replaces the page in history.

### 5. Degrade to something safe

Every optional dependency has a safe fallback: no LLM → clinician-written templates; offline
→ local results and crisis page; no open slots → helpline numbers; provider failure → template.

## Users

| User | Gets | Does not get |
|---|---|---|
| Student | Check-in, results, history, exercises, chat, booking, export, erasure | Any view of other students; staff pages |
| Counsellor | Contact-request queue, crisis alerts, bookings, slot management, on-call rota, own profile | Unshared check-ins; admin-only aggregate routes are shared with counsellors by design, but no individual student lookup |
| Admin | Aggregate dashboard | Any individual student data |
| Clinical lead | Escalation recipient; review authority | A dedicated UI in this codebase |
| Operator | Deploy, health, logs, backups | Student content in logs (by contract) |
| DPO / ethics | Data inventory, encryption model, retention controls | — |

See [personas and roles](personas-and-roles.md) for the full capability matrix.

## Scope of this release

**In scope:** single-institute deployment, Google Workspace or Microsoft Entra SSO, English
and Hindi, campus counsellor booking, crisis alerting to staffed humans, admin aggregates,
offline crisis access, DPDP-style export/erasure.

**Out of scope for v1:** native mobile apps, push notifications (calendar ICS instead),
multi-tenant institute hosting, EHR integration, chat persistence, clinician-authored
treatment plans, insurance/billing, and automated risk monitoring.

**Launch is gated on people, not code.** Clinical sign-off, validated Hindi instruments,
staffed rota, legal approval, and a tabletop drill must close before launch. See
[LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md).

## Success signals (pilot)

The code exposes the measurements; the pilot defines targets.

- Check-in completion rate and drop-off step.
- Tier distribution and change over weeks.
- Median hours from contact request to first contact (only reported when n ≥ 10).
- Slots offered vs booked vs attended vs no-show.
- Crisis alerts acknowledged within the tier's escalation window.
- Zero unacknowledged crisis alerts older than the escalation ladder.

See [Admin and analytics](../02-flows/admin-and-analytics.md).

## Related reading

- [Glossary](glossary.md) — every term in this document
- [System architecture](../01-architecture/system-architecture.md) — how the pieces fit
- [Safety triage](../03-domains/safety-triage.md) — the actual tier rules
- [Privacy and crypto](../03-domains/privacy-and-crypto.md) — how the data claims are enforced
- [clinical-review.md](../clinical-review.md) — what a clinician must approve
