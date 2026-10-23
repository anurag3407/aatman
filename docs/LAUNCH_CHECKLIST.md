# Launch checklist

The software is built and tested. Launch is gated on the items below, which need people at NITP, not code.
**Owner** is a suggestion. Don't launch with any 🔴 item open.

## 🔴 Clinical governance (blocking)

| # | Item | Owner | Done |
|---|---|---|---|
| C1 | Name a **clinical lead** (licensed counsellor or psychiatrist) who signs off everything in [clinical-review.md](clinical-review.md) | Dean of Students | ☐ |
| C2 | Clinical lead approves **tier thresholds and the C-SSRS → tier mapping** (`src/lib/safety/triage.ts`) | Clinical lead | ☐ |
| C3 | Clinical lead reviews **crisis lexicon v1** and expands the golden set to **300+ phrases** with real (anonymised) student phrasing (`src/lib/safety/lexicon/`, `tests/safety/golden.ts`) | Clinical lead + counselling cell | ☐ |
| C4 | Replace the draft Hindi PHQ-9/GAD-7 with the **official validated Hindi translations** (phqscreeners.com) and have a Hindi-speaking clinician review all Hindi clinical copy (`src/messages/hi.ts`) | Clinical lead | ☐ |
| C5 | Approve all result headings, templates, crisis copy and both LLM system prompts (`src/messages/*.ts` → `templates`, `results`; `src/lib/llm/prompts.ts`) | Clinical lead | ☐ |
| C6 | Write the **escalation SOP**: who works the contact-request queue, target response time per tier (e.g. crisis same working day), what happens at night, on weekends and in holidays (default: Tele-MANAS), and how to escalate to the medical officer | Counselling cell | ☐ |
| C7 | Decide on C-SSRS training for counsellors who will read shared C-SSRS answers | Clinical lead | ☐ |

## 🔴 Legal and privacy (blocking)

| # | Item | Owner | Done |
|---|---|---|---|
| L1 | Institute legal/DPO reviews the consent text and privacy notice (`src/messages/en.ts` → `consent`, `privacy`) against the **DPDP Act 2023 and DPDP Rules 2025** | Registrar / DPO | ☐ |
| L2 | Confirm the **under-18 approach** (no-account mode, nothing stored) satisfies the verifiable-parental-consent requirement | DPO | ☐ |
| L3 | Name the **grievance officer** and put their contact into the privacy notice | Registrar | ☐ |
| L4 | If pilot data will be used for research or a paper: **Institute Ethics Committee approval before launch** | PI / Dean | ☐ |
| L5 | Sign a **zero-data-retention** agreement with the LLM provider, or self-host (`LLM_PROVIDER=openai_compat`), or launch with `LLM_PROVIDER=none` (templates only; everything still works) | IT / DPO | ☐ |
| L6 | Record which institute bodies get what: aggregates only to admin (k ≥ 10), individual data only via student opt-in. Align with the Supreme Court's July 2025 student mental-health guidelines | Dean of Students | ☐ |

## 🔴 Infrastructure and configuration (blocking)

| # | Item | Owner | Done |
|---|---|---|---|
| I1 | Managed **Postgres in an India region**, with automated encrypted backups and point-in-time recovery | IT | ☐ |
| I2 | Generate secrets in a secrets manager: `SESSION_SECRET`, `PSEUDONYM_KEY`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET`. **Back up `PSEUDONYM_KEY` and `DATA_ENCRYPTION_KEY` separately from DB backups.** Losing them makes all data unreadable | IT | ☐ |
| I3 | Register **Google Workspace** (internal OAuth app) and/or **Microsoft Entra** (single-tenant) SSO; set the redirect URIs from [deployment.md](deployment.md) | IT | ☐ |
| I4 | Set `COUNSELLOR_EMAILS` and `ADMIN_EMAILS` | Counselling cell | ☐ |
| I5 | Fill **campus contacts** (counsellor, medical centre) in `src/lib/safety/helplines.ts`. They stay hidden until set | Counselling cell | ☐ |
| I6 | Re-verify every **national helpline number** (Tele-MANAS 14416 / 1-800-891-4416, 112, iCall, anti-ragging 1800-180-5522) | Counselling cell | ☐ |
| I7 | Schedule `POST /api/cron/retention` daily with `Authorization: Bearer $CRON_SECRET` | IT | ☐ |
| I8 | Serve over HTTPS on an institute domain; run `pnpm db:migrate` as a release step | IT | ☐ |
| I9 | Uptime monitor on `/api/health`; alert the on-call contact | IT | ☐ |
| I10 | Set `HOSTEL_NAMES` so hostel names are scrubbed from chat text | IT | ☐ |

## 🟡 Before opening to the pilot cohort

| # | Item | Done |
|---|---|---|
| P1 | Counsellors create **slots for the next 2 weeks**. Do a walkthrough: student journey at every tier → contact request → counsellor queue | ☐ |
| P2 | Test sign-in with a real student account, and confirm personal Gmail and other domains are refused | ☐ |
| P3 | Test on low-end Android phones and on hostel Wi-Fi; turn on airplane mode and confirm `/crisis` and the exercises load | ☐ |
| P4 | Run `pnpm check && pnpm test:e2e` against the release build | ☐ |
| P5 | If using an LLM: run the red-team set (`tests/llm/redteam.ts`) against the real provider and review 50 real outputs with the clinical lead | ☐ |
| P6 | Accessibility pass (screen reader, large text) in English and Hindi | ☐ |

## Phase 6: Pilot (4 weeks, 50–100 volunteers)

Track these from the admin dashboard and the counsellor queue. Don't report "number of users" as success.

- Check-in completion rate
- % of moderate-or-higher students who book a session or send a contact request
- Median hours from contact request to first contact (dashboard)
- 2-week re-check rate
- Counsellor-rated usefulness of shared check-ins (short survey)
- Every crisis-tier event reviewed by the clinical lead within 1 working day (process, not code)

Review after 4 weeks with the clinical lead before widening access.
