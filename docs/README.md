# Aatman documentation

Aatman is a wellbeing check-in for NIT Patna students. Students answer validated screening
questions; plain code scores the answers and a deterministic safety gate routes each student
to self-care, a counsellor, or crisis lines. An LLM writes short notes only for low tiers and
never decides risk.

This folder is the engineering and operations reference for the system. It describes the
software as it exists in this repository. Where a behaviour is gated on a human process
(clinical sign-off, rota staffing, legal approval), the doc says so explicitly.

**Set:** 40 documents (~10,000 lines), verified against commit `c715475` on 2026-10-24.
All internal links, anchors, and the 228 referenced source paths were checked against the
repository.

> **Audience.** Engineers, reviewers, counsellors, administrators, DPO/ethics reviewers, and
> operators. Start with the reading path that matches your role.

---

## Reading paths

| If you are… | Read, in order |
|---|---|
| New to the codebase | [Product overview](00-overview/product-overview.md) → [System architecture](01-architecture/system-architecture.md) → [User journeys](02-flows/user-journeys.md) → [Data flow](01-architecture/data-flow.md) → [db.md](04-data/db.md) |
| Reviewing safety or clinical behaviour | [Scales and scoring](03-domains/scales-and-scoring.md) → [Safety triage](03-domains/safety-triage.md) → [Crisis detection](03-domains/crisis-detection.md) → [clinical-review.md](clinical-review.md) |
| Reviewing privacy or security | [Privacy and crypto](03-domains/privacy-and-crypto.md) → [Security architecture](01-architecture/security-architecture.md) → [privacy-and-security.md](privacy-and-security.md) → [Data flow](01-architecture/data-flow.md) |
| Operating the deployment | [Configuration](06-operations/configuration.md) → [deployment.md](deployment.md) → [Runbook](06-operations/runbook.md) |
| Building a feature | [Backend architecture](01-architecture/backend-architecture.md) → [API reference](05-api/api-reference.md) → [db.md](04-data/db.md) → [Conventions and recipes](08-contributing/conventions-and-recipes.md) |
| Auditing test coverage | [Testing strategy](07-quality/testing-strategy.md) → [Test files](../tests) |

---

## Complete index

### 00 — Overview

| Doc | What it answers |
|---|---|
| [Product overview](00-overview/product-overview.md) | What Aatman is, the problem it solves, scope, non-goals, product principles |
| [Personas and roles](00-overview/personas-and-roles.md) | Student, counsellor, admin, clinical lead, operator, DPO; capabilities and limits |
| [Glossary](00-overview/glossary.md) | Every domain term, abbreviation, tier, scale, and system concept in one place |

### 01 — Architecture

| Doc | What it answers |
|---|---|
| [System architecture](01-architecture/system-architecture.md) | Runtime topology, layers, trust boundaries, statelessness, scaling model |
| [Frontend architecture](01-architecture/frontend-architecture.md) | App Router structure, route groups, server/client component split, design system, PWA |
| [Backend architecture](01-architecture/backend-architecture.md) | Services, route handlers, server actions, database access, transactions, background work |
| [Data flow](01-architecture/data-flow.md) | End-to-end movement of check-in, chat, booking, alert, and aggregate data |
| [Security architecture](01-architecture/security-architecture.md) | Authn/authz, CSRF, headers, secrets, threat boundaries, LLM isolation |

### 02 — User flows

| Doc | What it answers |
|---|---|
| [User journeys](02-flows/user-journeys.md) | Every primary journey from first visit to crisis, booking, and erasure |
| [Onboarding and authentication](02-flows/onboarding-and-auth.md) | Consent → age gate → SSO → role landing; minor and dev modes |
| [Check-in and results](02-flows/checkin-and-results.md) | Question sequence, branching, scoring, saving, results layout |
| [Crisis flow](02-flows/crisis.md) | What happens on crisis/urgent, alerts, offline page, quick exit |
| [Booking flow](02-flows/booking.md) | Slot discovery, booking, sharing, reminders, reschedule, cancel |
| [Counsellor workflow](02-flows/counsellor-workflow.md) | Requests, alerts, bookings, slots, on-call rota, attendance |
| [Admin and analytics](02-flows/admin-and-analytics.md) | Aggregate dashboard, k-anonymity, what admins cannot see |
| [Chat and companion](02-flows/chat-and-companion.md) | Reflective chat lifecycle, safety pause, PII scrubbing, limits |
| [Offline and stateless](02-flows/offline-and-stateless.md) | Service worker, offline results, under-18 no-account mode |

### 03 — Domain modules

| Doc | What it answers |
|---|---|
| [Scales and scoring](03-domains/scales-and-scoring.md) | PHQ-2/9, GAD-2/7, WHO-5, C-SSRS: items, cutoffs, proration, edge cases |
| [Safety triage](03-domains/safety-triage.md) | Tier rules, precedence, reason codes, server re-scoring, invariants |
| [Crisis detection](03-domains/crisis-detection.md) | Lexicon, normalisation, recall policy, ragging, golden set |
| [LLM and guardrails](03-domains/llm-and-guardrails.md) | Providers, prompts, output guard, fallback templates, data minimisation |
| [Alerts and escalation](03-domains/alerts-and-escalation.md) | Alert creation, outbox, on-call routing, escalation ladder, retries |
| [Booking and reminders](03-domains/booking-and-reminders.md) | Slot model, concurrency, eligibility, reminders, attendance |
| [Privacy and crypto](03-domains/privacy-and-crypto.md) | Pseudonyms, field encryption, AAD binding, PII scrubbing, consent versions |
| [Retention and erasure](03-domains/retention-and-erasure.md) | Retention windows, keep flag, erasure cascade, DPDP rights |
| [Audit and aggregates](03-domains/audit-and-aggregates.md) | Audit actions, k-anonymity, complementary suppression, service metrics |
| [Internationalisation](03-domains/i18n.md) | Locale resolution, catalog structure, IST formatting, translation rules |

### 04 — Data

| Doc | What it answers |
|---|---|
| [db.md](04-data/db.md) | **Canonical database reference**: every table, column, type, constraint, index |
| [ERD and data model](04-data/erd-and-data-model.md) | Relationships, ownership, lifecycle, encryption map, access paths |
| [Migrations](04-data/migrations.md) | Migration history, generation workflow, deploy sequencing, rollback limits |

### 05 — API

| Doc | What it answers |
|---|---|
| [API reference](05-api/api-reference.md) | Every HTTP route and server action: auth, input, output, status codes |

### 06 — Operations

| Doc | What it answers |
|---|---|
| [Configuration](06-operations/configuration.md) | Every environment variable, validation rules, local setup |
| [Runbook](06-operations/runbook.md) | Day-2 operations: health, deploys, alerts, backups, incidents, rollback |

### 07 — Quality

| Doc | What it answers |
|---|---|
| [Testing strategy](07-quality/testing-strategy.md) | Test pyramid, CI gates, fakes, golden sets, e2e topology |

### 08 — Contributing

| Doc | What it answers |
|---|---|
| [Conventions and recipes](08-contributing/conventions-and-recipes.md) | Code conventions and step-by-step recipes for common changes |

### Existing governance documents

| Doc | Purpose |
|---|---|
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | Human/process gates that must close before launch |
| [clinical-review.md](clinical-review.md) | Clinical decisions requiring the clinical lead's sign-off |
| [deployment.md](deployment.md) | VPS deployment runbook (Caddy → app replicas → Postgres) |
| [privacy-and-security.md](privacy-and-security.md) | Short data-protection overview for the DPO and ethics committee |

---

## System at a glance

```text
Browser
  ├─ Next.js App Router (server components, client islands)
  ├─ Service worker: precached /crisis, cached exercises, no personal pages
  └─ sessionStorage: in-progress check-in draft, offline/stateless results
        │ HTTPS, same-origin only
        ▼
Caddy ──► N stateless Next.js replicas ──► Postgres
                │                           ├─ encrypted check-in payloads
                │                           ├─ alerts, outbox, rate limits
                │                           └─ audit log
                ├──► Institute SSO (Google Workspace / Microsoft Entra)
                └──► LLM provider (optional; scores-only summaries, scrubbed chat)
                          ▲
             cron container: alerts every minute,
             retention daily, pg_dump daily
```

**Load-bearing invariants**

1. Triage never calls a model and is identical on client and server. The server re-scores
   every submitted check-in; client scores are not trusted.
2. Free text is scanned for crisis language and then discarded — never stored, never sent to
   an LLM.
3. Crisis and urgent check-ins produce an alert and a PII-free notification in the same
   database transaction as the check-in.
4. No student email, name, or roll number is stored. The email becomes an HMAC pseudonym at
   sign-in.
5. A counsellor sees student data only after an explicit per-request opt-in or a booking with
   sharing ticked. Every view is audited.
6. Admins see aggregates only, with k ≥ 10 suppression.

**Code entry points**

| Concern | Path |
|---|---|
| Scoring | `src/lib/scales/` |
| Safety gate and lexicon | `src/lib/safety/` |
| Check-in state machine | `src/lib/checkin/flow.ts` |
| LLM adapters, prompts, guard | `src/lib/llm/` |
| Auth and sessions | `src/lib/auth/` |
| Encryption and PII | `src/lib/privacy/` |
| Business logic | `src/lib/services/` |
| HTTP handlers | `src/app/api/` |
| Student UI | `src/app/(app)/` |
| Staff UI and actions | `src/app/(staff)/` |
| Copy (EN/HI) | `src/messages/` |
| Offline crisis page | `src/app/crisis/`, `public/sw.js` |
| Deploy | `deploy/`, `Dockerfile`, `render.yaml` |

---

## Documentation conventions

- **Present tense, implementation-first.** Statements describe current code. Draft or
  clinician-gated behaviour is labelled **DRAFT** or **requires sign-off**.
- **Code references** use repository-relative paths such as `src/lib/safety/triage.ts`.
- **Diagrams** are ASCII or Mermaid and are kept small enough to read in a terminal.
- **No secrets.** Environment variables are named, never valued. Real settings live in
  `.env.local` (local) or `/opt/aatman/shared/.env` (server).
- **When code changes, update the doc in the same pull request.** The API reference, db.md,
  and flow docs are the most likely to drift.

## Keeping this set accurate

| Change | Docs to update |
|---|---|
| New/changed table or column | [db.md](04-data/db.md), [ERD](04-data/erd-and-data-model.md), [migrations](04-data/migrations.md) |
| New route or status code | [API reference](05-api/api-reference.md) |
| Tier rule or reason code | [Safety triage](03-domains/safety-triage.md), [clinical-review.md](clinical-review.md) |
| New env var | [Configuration](06-operations/configuration.md), `.env.example`, `deploy/.env.example` |
| New user-visible flow | [User journeys](02-flows/user-journeys.md) + the specific flow doc |
| Retention window change | [Retention](03-domains/retention-and-erasure.md) + [db.md](04-data/db.md) |
