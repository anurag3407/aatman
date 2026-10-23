# Aatman

A wellbeing check-in for NIT Patna students. Students answer standard screening questions (PHQ-9, GAD-7, C-SSRS). Plain code scores the answers, and a safety gate routes each student to the right next step: self-care, a counsellor, or crisis lines right away. The AI only writes a short, warm note from the scores, and only for low tiers. It never diagnoses or decides risk.

> **Status:** the software is ready for a pilot. The launch also depends on people and approvals at NITP. See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).

## Quick start (local)

```bash
pnpm install
pnpm setup:env      # writes .env.local with random keys and dev sign-in enabled
pnpm dev            # http://localhost:3000
```

Local runs need no database server: `DATABASE_URL=pglite:./.data/pglite` runs embedded Postgres and applies migrations on start.

- **Student:** sign in with any `@nitp.ac.in` email on the dev sign-in form.
- **Counsellor:** `counsellor@nitp.ac.in`. **Admin:** `admin@nitp.ac.in`.
- **Turning on AI notes and chat:** set `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, or `LLM_PROVIDER=mock` for offline demos.

## Tests

```bash
pnpm check          # typecheck + lint + unit/integration tests
pnpm test:e2e       # Playwright: builds production, runs two servers, tests full journeys and offline mode
```

| Suite | What it guards |
|---|---|
| `tests/scales` | Every published cutoff and band boundary; C-SSRS risk levels |
| `tests/safety` | Crisis detector golden set (EN / Hinglish / Devanagari); **CI fails below 100% recall**; triage for every item-9 value and C-SSRS path |
| `tests/checkin` | Question order, the always-asked self-harm item, early stop on high risk |
| `tests/llm` | Red-team outputs the guard must block (diagnosis, medication, made-up helplines, harm language); template fallbacks |
| `tests/services` | Real Postgres (PGlite): encryption at rest, free text never stored, booking race, erasure, retention, k-anonymity |
| `tests/e2e` | Crisis journey through to the counsellor, under-18 mode sends nothing, chat safety pause, offline crisis page |

## How it works

```
check-in (one question per screen, skippable)
  └─ triage()  ── pure code, runs in browser AND server ──┐
       PHQ-2/GAD-2 → item 9 (always) → C-SSRS if item 9 > 0 → full scales if screen positive
       free text → crisis lexicon (never stored, never sent to an LLM)
                                                            ▼
            tier: mild | moderate | elevated | urgent | crisis
                                                            ▼
   mild/moderate: AI note (scores only) → output guard → else template
   elevated+:     clinician-written template, contact-me form, one-tap calls
```

| Area | Where |
|---|---|
| Scoring | `src/lib/scales/` |
| Safety gate, crisis lexicon, helplines | `src/lib/safety/` |
| Check-in sequence | `src/lib/checkin/flow.ts` |
| LLM adapters (Anthropic, OpenAI-compatible, mock), prompts, output guard | `src/lib/llm/` |
| Pseudonyms, field encryption, PII scrubbing | `src/lib/privacy/` |
| SSO (Google Workspace / Microsoft Entra), sessions | `src/lib/auth/` |
| Data services (check-ins, booking, contact requests, aggregates, retention) | `src/lib/services/` |
| Copy: English + Hindi (all clinical text is here) | `src/messages/` |
| Offline crisis page and service worker | `src/app/crisis/`, `public/sw.js` |

## Privacy model, in short

- **No student email, name or roll number is stored.** The email becomes `HMAC(PSEUDONYM_KEY, email)` at sign-in.
- **Answers, scores, notes and contact details are encrypted per field** (AES-256-GCM, bound to the owner). A database dump shows only tiers and timestamps.
- **A counsellor sees a student's data only when the student sends a contact request, or books with sharing ticked.** Each view is audit-logged.
- **Admins see weekly totals only.** Counts below 10 are hidden.
- **Free text and chat are scanned and then dropped.** The chat lives only in the browser.
- **Students can export and erase everything.** Check-ins auto-delete after 12 months.
- **Under-18s get a mode with no account**, where nothing leaves the device.

More detail: [docs/privacy-and-security.md](docs/privacy-and-security.md). Deployment: [docs/deployment.md](docs/deployment.md). Clinical sign-off list: [docs/clinical-review.md](docs/clinical-review.md).
