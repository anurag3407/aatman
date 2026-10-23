# User journeys

## Journey map

```text
                         ┌───────────────────────┐
                         │ Landing page /        │
                         │ direct link / install │
                         └───────────┬───────────┘
                                     ▼
                         ┌───────────────────────┐
                         │ /consent  (age gate)  │
                         └───────┬───────┬───────┘
                       adult     │       │  under 18
                                 ▼       ▼
                     ┌──────────────┐  ┌──────────────────────────┐
                     │ SSO sign-in  │  │ Stateless check-in       │
                     │ dev login    │  │ (nothing leaves device)  │
                     └──────┬───────┘  └────────────┬─────────────┘
                            ▼                       │
                     ┌──────────────┐               │
                     │ /checkin     │◄──────────────┘
                     └──────┬───────┘
                            ▼
                     ┌──────────────┐
                     │ triage()     │
                     └──┬────┬───┬───┘
             mild/moderate│    │   │elevated/urgent/crisis
                            ▼    │   ▼
                  ┌────────────┐ │ ┌──────────────────────┐
                  │ Results    │ │ │ Results + crisis     │
                  │ self-care  │ │ │ actions + alert      │
                  └─────┬──────┘ │ └──────┬───────────────┘
                        │        │        │
        ┌───────────────┼────────┘        │
        ▼               ▼                 ▼
  Exercises        Contact request   One-tap 14416 / 112
  Chat             Booking           /crisis page
  Calendar ICS     Counsellor        Contact request
                   callback          Booking
```

## Journey catalogue

| # | Journey | Entry | Ends at | Server writes | Doc |
|---|---|---|---|---|---|
| J1 | First visit and consent | `/`, `/checkin` while signed out | `/signin` or stateless check-in | Consent (if signed in) | [Onboarding](onboarding-and-auth.md) |
| J2 | Sign in | `/signin` | Role landing | `students` row; `staff_login` audit | [Onboarding](onboarding-and-auth.md) |
| J3 | Saved check-in | `/checkin` | `/results/{id}` | `checkins`, maybe alert/outbox | [Check-in](checkin-and-results.md) |
| J4 | Stateless check-in | `/checkin?mode=stateless` | `/results/local` | None | [Offline](offline-and-stateless.md) |
| J5 | Offline check-in | Submit while offline | `/results/local` | None | [Offline](offline-and-stateless.md) |
| J6 | Low-tier follow-up | Results | Exercises, chat, ICS | None | [Check-in](checkin-and-results.md) |
| J7 | Contact request | Results / book | Confirmation banner | `contact_requests`; alert link | [Crisis](crisis.md) |
| J8 | Book a session | `/book` | Booking confirmation | `slots` update, audit on reschedule | [Booking](booking.md) |
| J9 | Crisis response | Results or chat | Calls / crisis page | Alert (from check-in) | [Crisis](crisis.md) |
| J10 | Reflective chat | `/chat` | Conversation or safety pause | None | [Chat](chat-and-companion.md) |
| J11 | Exercises | `/exercises` | Exercise completion | None | [Offline](offline-and-stateless.md) |
| J12 | History and keep | `/history` | Result detail | `keep` toggle | [Check-in](checkin-and-results.md) |
| J13 | Export | `/settings` | JSON download | None | [Retention](../03-domains/retention-and-erasure.md) |
| J14 | Erase | `/settings` | Landing page, signed out | Deletes student + cascade; audit | [Retention](../03-domains/retention-and-erasure.md) |
| J15 | Counsellor queue | `/counsellor` | Request/session detail | Audit on open | [Counsellor](counsellor-workflow.md) |
| J16 | Alert response | `/counsellor/alerts` | Resolved alert | Status/note; audit | [Crisis](crisis.md) |
| J17 | Slot management | `/counsellor/slots` | Published slots | Slots, profile, audit | [Counsellor](counsellor-workflow.md) |
| J18 | Admin review | `/admin` | Read-only dashboard | None | [Admin](admin-and-analytics.md) |
| J19 | Quick exit | Any app page | Neutral search page | None | [Crisis](crisis.md) |
| J20 | Offline safety | Any page, offline | `/crisis` | None | [Offline](offline-and-stateless.md) |

---

## J1 — First visit and consent

**Entry points:** landing page, shared link to `/checkin`, installed PWA, poster QR code.

1. Landing page renders in the visitor's language (cookie or `Accept-Language`).
2. Any path into the check-in first checks session:
   - no session → `/consent`
   - session without current consent → `/consent`
   - staff session on a student page → `/`
3. `/consent` asks age **before** anything else:
   - "18 or older" → agree → `/api/consent`.
   - "Under 18" → explains the no-account mode → `/checkin?mode=stateless`.
4. If not signed in, `/api/consent` stores a 30-minute `aat_c` cookie and redirects to
   `/signin`. The callback records consent against the new pseudonym.
5. If signed in, consent is written immediately and the student goes to `/checkin`.

**Design intent:** consent precedes account creation, so the student knows what will be
stored before an identity is pseudonymised.

---

## J2 — Sign in

1. `/signin` shows only configured providers (Google, Microsoft) plus dev login when enabled.
2. Provider → OIDC redirect with PKCE/state/nonce.
3. Callback verifies claims, domain, and tenant; assigns role.
4. Landing by role: student → `/checkin`, counsellor → `/counsellor`, admin → `/admin`.
5. Errors return to `/signin?error=<reason>` with translated copy.

Failure reasons shown: `wrong_domain`, `unverified`, `wrong_tenant`, `no_email`, `failed`.

---

## J3 — Saved check-in

1. One question per screen, progress bar, back/skip.
2. Item 9 is always asked. A positive answer immediately shows an inline support banner.
3. C-SSRS appears only after item 9 > 0; a high-risk result ends the check-in.
4. Campus questions, optional deeper scales, optional free text.
5. "See my results" → `POST /api/checkins`.
6. On success → `/results/{id}`.
7. Results layout depends on tier; summary loads asynchronously (template immediately for
   offline/stateless).

**Failure branches**

| Condition | Outcome |
|---|---|
| Session expired | Redirect `/signin` |
| Consent outdated | Redirect `/consent` |
| Server error | Error banner; answers retained |
| Network failure | Local results, "not saved" banner |
| Rate limited | Error banner (10/hour) |

---

## J6 — Low-tier follow-up

For `mild`:

- Template or LLM note.
- Exercises primary action.
- Chat link.
- Campus tips if any campus answer ≥ 2.
- 14-day calendar reminder (`.ics`).
- Score details (collapsed, non-diagnostic).
- New check-in / history.

For `moderate`:

- Booking primary.
- Contact form secondary (collapsed by default).
- Chat available.
- Tips, exercises, ICS.

---

## J7 — Contact request

Available from results (moderate+) and the booking page.

1. Student opens the form; enters name (optional), phone and/or email (at least one), best
   time.
2. Ticks explicit consent.
3. `POST /api/contact-requests` seals details, copies the tier, links any open alert.
4. UI shows "sent". The request appears in the counsellor queue immediately.
5. Counsellor opens it (audit), contacts the student, marks `contacted`, eventually `closed`.

Caps: 3 open requests. If a check-in is missing, the API returns `no_checkin`.

---

## J8 — Book a session

1. `/book` lists open slots in the next 14 days, plus the student's upcoming bookings.
2. Priority slots appear only if the latest check-in is `elevated` or higher.
3. Student selects a slot, optionally shares the latest check-in, adds a phone number, opts
   into SMS reminders.
4. Booking is atomic; a race loser sees "someone just booked that time".
5. Student can reschedule or cancel before the start.

See [Booking](booking.md).

---

## J9 — Crisis response

At `crisis` or `urgent`:

1. Results show one-tap Tele-MANAS 14416 and 112 **first**.
2. Clinician-written template (no LLM).
3. Contact form and booking are available.
4. An alert exists for on-call staff; escalation begins at 10 minutes (crisis) or 30 minutes
   (urgent).
5. The student can open `/crisis` for all helplines, anti-ragging, and a breathing exercise.
6. Chat is not offered on results at elevated or above; if a crisis message is typed in chat,
   it pauses and shows the same crisis actions.

The app cannot call anyone and is not monitored in real time; this is stated on the crisis
page.

---

## J15–J17 — Staff journeys

**Queue:** requests sorted by severity then newest; badges show tier and status. Opening a
request is audited.

**Alert:** acknowledge (one click), open detail, follow the SOP, resolve with an encrypted
note. The alert detail shows severity, age, escalation level, and whether callback details
were shared — never answers.

**Slots:** create recurring slots (duration, per-day count, weeks, location, mode, priority),
edit public profile, cancel slots, mark attendance after the session starts.

See [Counsellor workflow](counsellor-workflow.md).

---

## J19 — Quick exit

- Header button, or press Escape twice within one second.
- Clears `sessionStorage` (draft, local results).
- Replaces the current history entry with a neutral search URL.
- Does not sign out, delete server data, or clear cookies. A student on a shared device should
  also sign out from Settings; quick exit is for immediate physical privacy, not account
  security.

---

## J20 — Offline safety

- `/crisis` is precached with its assets at service-worker install.
- Any offline navigation to another page redirects to `/crisis`.
- Exercises visited before are available offline.
- A check-in submitted offline is scored locally and shown as "not saved".
- No personal page or API response is ever cached.

---

## Cross-journey rules

| Rule | Consequence |
|---|---|
| Consent is required before every saved student action | API returns `403 consent_required` |
| A student can only see their own rows | 404 for another student's UUID |
| Counsellors need an explicit share | No lookup by pseudonym exists |
| Staff views are audited | Every open of a request/booking/alert writes a row |
| Every optional dependency has a fallback | No LLM → template; offline → local/crisis |
| Crisis affordances are never more than one tap away | Header "Help now" on every student page |

## Related reading

- [Onboarding and authentication](onboarding-and-auth.md)
- [Check-in and results](checkin-and-results.md)
- [Crisis flow](crisis.md)
- [Booking flow](booking.md)
- [Counsellor workflow](counsellor-workflow.md)
- [Admin and analytics](admin-and-analytics.md)
- [Chat and companion](chat-and-companion.md)
- [Offline and stateless](offline-and-stateless.md)
