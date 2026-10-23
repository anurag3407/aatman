# Glossary

Terms are grouped. Code identifiers are shown in `monospace`.

## Product and safety

| Term | Meaning |
|---|---|
| **Aatman** | The application. Name and tab title are deliberately neutral; the installed app is called "Aatman" with the description "A quiet space to check in with yourself." |
| **Check-in** | One completed screening session: answers, campus questions, computed triage, optional summary. Stored as one `checkins` row. |
| **Tier** | The support level produced by triage: `mild`, `moderate`, `elevated`, `urgent`, `crisis`, ordered low to high. |
| **Safety gate / triage** | The pure function `triage()` that maps answers to a tier plus reason codes. Runs client-side and server-side. |
| **Reason code** | A stable machine code explaining why a tier was raised, e.g. `cssrs_high`, `text_acute`, `phq9_moderate_plus`. Stored for staff display and aggregation; safe to persist. |
| **Tier 1** | Informal name for the short check-in: PHQ-2 + GAD-2 + PHQ-9 item 9 + campus questions + free text. |
| **Deeper check** | The optional offer to complete the full PHQ-9 and/or GAD-7 when a 2-item screen is positive. |
| **Early stop** | Ending the check-in immediately after a high-risk C-SSRS result so support is not delayed. |
| **Crisis language** | Text matching the deterministic lexicon at level `passive`, `self_harm`, or `acute`. |
| **Ragging** | Bullying/hazing. Detected separately so the app can show the anti-ragging helpline and keep the text away from the LLM; it does **not** raise the crisis tier by itself. |
| **Stateless mode** | No-account check-in (`/checkin?mode=stateless`) for under-18s or anyone who does not want persistence. Results live in `sessionStorage` only. |
| **Offline result** | A check-in completed when the server was unreachable; scored locally, shown from `sessionStorage`, never saved. |
| **Quick exit** | Button (or double Escape within 1 s) that clears `sessionStorage` and replaces the page with a neutral search URL. |
| **Companion** | The visual character and voice of the app (`CompanionMark`, `CompanionNote`); also the name of the reflective chat persona. |
| **Contact request** | A student's explicit opt-in to share one check-in and callback details with the counselling team. |
| **Callback details** | Name/phone/email/best time typed into a contact request. Encrypted; visible only to counsellors, with audit. |
| **Priority slot** | A slot marked `is_urgent`, hidden from the general list and offered only to students whose latest check-in is `elevated` or higher. |
| **Keep flag** | Per-check-in boolean (`keep`) exempting it from automatic retention deletion. |
| **Erase** | Full account deletion: frees future bookings, deletes the student row, cascades check-ins/requests/alerts. |
| **Export** | JSON download of everything stored for the student's pseudonym. |
| **Aggregate suppression** | Hiding counts 1–9 (`k = 10`) and one complementary cell to prevent differencing. |

## Clinical instruments

| Term | Meaning |
|---|---|
| **PHQ-9** | Patient Health Questionnaire-9. Nine items, 0–3 each, total 0–27. Item 9 (index 8) asks about self-harm thoughts and is always asked. |
| **PHQ-2** | First two PHQ-9 items; positive at total ≥ 3. |
| **GAD-7** | Generalized Anxiety Disorder-7. Seven items, 0–3 each, total 0–21. |
| **GAD-2** | First two GAD-7 items; positive at total ≥ 3. |
| **WHO-5** | Five-item wellbeing index, 0–5 each, reported as a percentage (raw × 4). Scored in code; not asked in v1. |
| **C-SSRS screener** | Columbia Suicide Severity Rating Scale screener (past month). Asked only after PHQ-9 item 9 > 0. |
| **C-SSRS risk** | `none`, `low`, `moderate`, `high`, `incomplete`. Aatman maps this more conservatively than Columbia's published labels (see below). |
| **Prorating** | Estimating a total when at most one item is missing: `round(sum × n / answered)`. PHQ-2/GAD-2 are never prorated. |
| **Band** | Internal severity label for a scale total (e.g. `moderately_severe`). Students never see diagnostic labels. |
| **Item 9** | PHQ-9 self-harm item. `PHQ9_SAFETY_ITEM_INDEX = 8`. |
| **Safety item skipped** | Item 9 left `null`. Cannot rule out risk, so the tier is raised to `elevated`. |

## Privacy and security

| Term | Meaning |
|---|---|
| **Pseudonym** | `p_` + base64url(HMAC-SHA256(PSEUDONYM_KEY, lowercase-trimmed email)). Primary key of `students`; the only student identifier stored. |
| **Field encryption** | AES-256-GCM over a JSON value, with the owner's pseudonym as additional authenticated data (AAD). Format `v1.<base64url(iv|ciphertext|tag)>`. |
| **AAD binding** | Copying a ciphertext to another student's row makes decryption fail, because the AAD no longer matches. |
| **Seal / unseal** | `seal(value, pseudonym)` encrypts; `unseal<T>(encoded, pseudonym)` decrypts. |
| **PII scrub** | Heuristic removal of emails, phones, URLs, roll numbers, room numbers, hostel names, and names after titles/relationship words before text reaches an LLM. |
| **Free text** | Optional check-in text. Scanned for crisis terms, used for ragging flag, then discarded. Never stored. |
| **Chat transcript** | Conversation held only in React state in the browser. Never stored server-side. |
| **Consent version** | `CONSENT_VERSION = "2026-10-v1"`. A student on an older version is redirected to `/consent` before their next saved action. |
| **Session cookie** | `aat_s`, HS256 JWT, httpOnly, SameSite=Lax, 7-day TTL, `Secure` in production. |
| **OIDC pending cookie** | `aat_o`, signed JWT carrying state/PKCE/nonce, 10-minute TTL, scoped to `/api/auth/callback`. |
| **Consent cookie** | `aat_c`, carries consent across the sign-in redirect, 30-minute TTL. |
| **Locale cookie** | `aat_lang`, `en` or `hi`, 1 year. |
| **Same-origin check** | CSRF defence: `Sec-Fetch-Site: same-origin` or an `Origin` equal to `APP_URL`. Required on every mutating route. |
| **k-anonymity** | No aggregate cell with a count from 1 to 9 is shown as a number. A second cell is suppressed when only one was suppressed. |

## Booking and operations

| Term | Meaning |
|---|---|
| **Slot** | A bookable counselling interval with counsellor email, start/end, location, mode, status, optional booking data. |
| **Booking window** | 14 days from now (`BOOKING_WINDOW_DAYS`). |
| **Upcoming cap** | At most 2 upcoming booked slots per student (`MAX_UPCOMING_BOOKINGS`). |
| **Session mode** | `in_person`, `phone`, or `video`. |
| **Attendance** | `attendedAt` or `noShowAt`, marked by a counsellor only after the session starts. |
| **Reminder** | Neutral SMS at ~24 h and ~2 h before a booked session, only with opt-in and a phone number. |
| **On-call shift** | A window naming the counsellor (and optional backup) who receives crisis alerts. |
| **Alert** | A `crisis_alerts` row for a crisis/urgent check-in. Contains a pseudonym, tier, timestamps, and an encrypted resolution note — no answers or contact details. |
| **Escalation level** | 0–3. Level 1 → backup counsellor, 2 → clinical lead, 3 → admin/fallback. |
| **Outbox** | `notification_outbox`: transactional queue of PII-free emails, retried with backoff. |
| **Dead** | Outbox status after 5 failed delivery attempts. |
| **Audit log** | Append-only record of staff/student/system actions with actor, action, and target id. No content. |
| **Retention** | Daily deletion of data past its window; check-ins 12 months by default unless kept. |
| **Aggregate** | Institute-level counts computed at query time, never per-student rows. |

## Platform and architecture

| Term | Meaning |
|---|---|
| **App Router** | Next.js 16 routing model used here: `src/app`, route groups, server components, route handlers, server actions. |
| **Route group** | Parenthesised folder that groups routes without adding a URL segment: `(app)` for students, `(staff)` for staff. |
| **Server component** | Default React component in `src/app` that runs on the server; used for data fetching via services. |
| **Client island** | A `"use client"` component (forms, chat, exercises) hydrated in the browser. |
| **Service** | Server-only module in `src/lib/services/` that owns business logic and database access. |
| **Route handler** | `route.ts` HTTP endpoint under `src/app/api/`. |
| **Server action** | `"use server"` function used by staff forms; defined in `src/app/(staff)/actions.ts`. |
| **Stateless replica** | An app container with no per-instance storage; any replica can serve any request. |
| **PGlite** | Embedded Postgres used for local development and tests (`pglite:./.data/pglite`, `pglite:memory`). |
| **Drizzle** | TypeScript ORM/schema/migration tool used for all database access. |
| **Standalone output** | Next.js build mode used in Docker (`output: "standalone"`). |
| **Deployment id** | `NEXT_DEPLOYMENT_ID` set per release so stale clients hard-reload during rolling deploys. |
| **Service worker** | `public/sw.js`; precaches `/crisis`, caches visited exercises, never caches personal pages. |
| **CSP** | Content-Security-Policy allowing only same-origin resources; no third-party origins. |
| **HSTS** | Strict-Transport-Security, applied in production only. |
| **Outbox pattern** | Notification rows written in the same transaction as the triggering alert, then delivered asynchronously. |
| **Skip locked** | `SELECT … FOR UPDATE SKIP LOCKED` used so concurrent workers do not claim the same row. |

## Tier quick reference

| Tier | Plain-language meaning | Student sees first |
|---|---|---|
| `mild` | Low symptom load | Self-care note and exercises |
| `moderate` | Positive screen or moderate symptoms | Counsellor booking; contact form secondary |
| `elevated` | Positive safety item, passive ideation, or skipped safety item | Support banner, contact form, booking, exercises |
| `urgent` | Active thoughts/method/incomplete C-SSRS, self-harm text | One-tap helplines, contact form, booking |
| `crisis` | Intent, plan with intent, recent behaviour, acute text | One-tap helplines first, crisis template, contact form |

The authoritative rules are in [Safety triage](../03-domains/safety-triage.md).
