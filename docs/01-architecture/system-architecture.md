# System architecture

## Purpose

This document describes the runtime shape of Aatman: the processes, layers, trust
boundaries, and the rules that keep the system stateless and safe to scale. It is the map;
the flow and domain docs are the territory.

## Technology stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.4.2 | Server components for data-heavy pages, route handlers for APIs, server actions for staff forms, standalone Docker output |
| UI runtime | React | 19.3.0 | Server/client component model |
| Language | TypeScript | 5.x | Strict types across DB, API, and UI |
| Styling | Tailwind CSS v4 via `@tailwindcss/turbopack` | 4.x | Utility styling with CSS-variable design tokens |
| Database | PostgreSQL 17 (prod), PGlite (dev/test) | — | Relational integrity, transactions, partial aggregates |
| ORM / migrations | Drizzle ORM + Drizzle Kit | 0.45.4 / 0.31.11 | Typed schema, SQL migrations, no runtime magic |
| Sessions / OIDC state | `jose` | 6.2.13 | HS256 JWTs in cookies |
| SSO | `openid-client` | 6.8.8 | Authorization code + PKCE, state, nonce |
| Validation | `zod` | 4.6.7 | Env, request bodies, server-action forms |
| LLM SDK | `@anthropic-ai/sdk` | 1.1.0 | Anthropic adapter; OpenAI-compatible adapter uses `fetch` |
| Unit/integration tests | Vitest | 3.2.7 | Fast server-side tests with PGlite |
| E2E tests | Playwright | 1.64 | Mobile viewport, two servers, offline mode |
| Package manager | pnpm | 10.33.0 | Lockfile-pinned installs |
| Runtime | Node.js | 24 (Docker `node:24-slim`) | Native fetch, modern crypto |

## Runtime topology

### Single VPS (reference deployment)

```text
                          internet
                             │ 80/443 (only public ports, besides SSH)
                    ┌────────▼────────┐
                    │      Caddy      │  Let's Encrypt, HTTP/3, gzip/zstd, 1 MB body cap
                    │  least_conn LB  │  dynamic re-resolution of app replicas
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
        │  app #1   │  │  app #2   │  │  app #N   │  stateless Next.js, read-only FS,
        │  :3000    │  │  :3000    │  │  :3000    │  non-root, cap_drop ALL
        └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
              └──────────────┼──────────────┘
                    ┌────────▼────────┐        ┌──────────────────┐
                    │    Postgres     │◄───────┤  cron container  │
                    │  (bundled or    │        │  alerts  every 1m│
                    │   managed)      │        │  retention daily │
                    └─────────────────┘        │  pg_dump daily   │
                                               └──────────────────┘
```

Networks (from `deploy/compose.yaml`):

- `edge`: internet-facing; Caddy ↔ app; app egress for SSO token exchange and LLM calls.
- `db`: internal-only; app ↔ Postgres, cron ↔ Postgres. No internet route.
- `egress`: used only by the one-shot migration container when the database is managed
  outside the host.

### Alternative: Render

`render.yaml` describes a single Docker web service plus an externally managed Postgres
(e.g. Supabase). Migrations run from `scripts/start.sh` at boot when `DATABASE_URL` is a
`postgres://` URL. Cron must be supplied externally; Render's blueprint does not define a
scheduler.

## Logical layers

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Presentation                                                        │
│  Server components (pages, layouts)  ·  Client islands (forms, chat)│
│  src/app/(app), src/app/(staff), src/app/crisis, src/components     │
├─────────────────────────────────────────────────────────────────────┤
│ Transport                                                           │
│  Route handlers src/app/api/**  ·  Server actions (staff)            │
│  Same-origin check · zod validation · auth guards                    │
├─────────────────────────────────────────────────────────────────────┤
│ Domain / services                                                   │
│  triage · scales · crisis detector · llm · privacy · alerts         │
│  booking · checkins · contactRequests · retention · aggregates      │
├─────────────────────────────────────────────────────────────────────┤
│ Persistence                                                         │
│  Drizzle schema · getDb() pool · transactions · SQL migrations      │
└─────────────────────────────────────────────────────────────────────┘
```

**Dependency rule.** Presentation may call services. Transport may call services. Services
may call other services and the database. Domain primitives (scales, triage, crisis detector,
crypto) are pure or near-pure and import nothing from UI or transport. No service imports a
React component.

## Core components

| Component | Responsibility | Source |
|---|---|---|
| Landing page | Public marketing entry, language-aware | `src/app/page.tsx`, `src/components/landing/` |
| Student shell | Header, nav, footer, i18n provider | `src/app/(app)/layout.tsx` |
| Check-in flow | State machine, draft persistence, submission, offline fallback | `src/lib/checkin/flow.ts`, `src/components/checkin/CheckinFlow.tsx` |
| Triage | Deterministic tier computation | `src/lib/safety/triage.ts` |
| Crisis detector | Multilingual lexicon matching | `src/lib/safety/crisisDetector.ts` |
| Results view | Tier-dependent layout and next steps | `src/components/results/ResultsView.tsx` |
| Chat | Stateless reflective conversation | `src/components/ChatView.tsx`, `src/lib/llm/index.ts` |
| Booking | Slot listing, atomic booking, reschedule | `src/lib/services/booking.ts` |
| Alerts | Alert creation, routing, escalation, outbox | `src/lib/services/alerts.ts` |
| Staff portal | Queues, details, slot and rota management | `src/app/(staff)/` |
| Admin dashboard | k-anonymous aggregates | `src/app/(staff)/admin/page.tsx`, `src/lib/services/aggregates.ts` |
| Crisis page | Static, offline-capable helplines | `src/app/crisis/page.tsx` |
| Service worker | Offline precache and navigation fallback | `public/sw.js` |
| Cron API | Authenticated background jobs | `src/app/api/cron/` |

## Request lifecycle

### A student page (server component)

```text
GET /history
  → Next.js renders (app)/layout.tsx and history/page.tsx on the server
  → layout: getMessages() reads locale cookie / Accept-Language
  → layout: getSession() verifies aat_s JWT
  → page: requireStudentPage() → session or redirect(/signin) or redirect(/consent)
  → page: listCheckins(pseudonym) → getDb() → Drizzle query
  → service decrypts payloadEnc with the owner's pseudonym (AES-GCM)
  → React server-renders HTML; client islands hydrate
  → response headers: CSP/HSTS in production, no-store on API routes
```

### A student mutation (route handler)

```text
POST /api/checkins
  → isSameOrigin(req)                       (CSRF)
  → requireApi(["student"], { consent: true })
  → rateLimit("checkin:<pseudonym>", 10/h)
  → readJson(req, checkinBody)              (content-type + zod)
  → createCheckin(pseudonym, input)
      → triage() re-score on server
      → drop free text
      → DB transaction:
          insert checkins (payload sealed)
          if tier ∈ {crisis, urgent}: insert crisis_alerts + outbox rows
  → 201 { id, createdAt, triage }
```

### A staff mutation (server action)

```text
POST /counsellor/requests/<id>  (form action)
  → Next.js invokes (staff)/actions.ts#setRequestStatus
  → requireCounsellor() reads session, redirects if not staff
  → zod parse FormData
  → updateContactRequestStatus(id, status, actor)
      → DB update + recordAudit(...)
  → revalidatePath("/counsellor") and the detail path
```

## Statelessness and scaling

Every app replica is interchangeable. There is no local session store, no sticky routing,
and no shared page cache requirement.

| State | Where it lives | Consequence |
|---|---|---|
| Session | Signed JWT in browser cookie | Any replica verifies it |
| OIDC pending state | Signed JWT cookie (`aat_o`) | Any replica can finish the callback |
| Consent carry-over | Signed-ish short cookie (`aat_c`) | Recorded at callback |
| Locale | Cookie / `Accept-Language` | Resolved per request |
| Check-in draft | Browser `sessionStorage` | Survives reload; not shared across devices |
| Offline/stateless results | Browser `sessionStorage` | Never sent |
| Chat transcript | React state | Lost on navigation/refresh |
| Rate limits | Postgres `rate_limits` | Holds across replicas |
| Booking concurrency | Conditional SQL + row locks | Holds across replicas |
| Alert claims | `SELECT … FOR UPDATE SKIP LOCKED` | Workers do not double-send |
| Build identity | `NEXT_DEPLOYMENT_ID` | Stale clients hard-reload |

### Scaling levers

- `APP_REPLICAS` in the server's `/opt/aatman/shared/.env`; each replica is independent.
- `DATABASE_POOL_MAX` per replica. Keep `replicas × pool + reserved` below Postgres
  `max_connections` (`PG_MAX_CONNECTIONS` defaults to 100).
- Caddy uses dynamic service discovery (`refresh 5s`) and least-connections.
- `lb_try_duration` lets requests retry on another replica while one drains.
- App containers use `stop_grace_period: 30s`; Next.js drains in-flight requests on SIGTERM.

### Why no shared cache

Personalised pages depend on the session and must never be cached across users. The only
static surfaces are `/crisis`, icons, and the app manifest. The service worker handles
client-side offline caching deliberately and excludes personal pages.

## Trust boundaries

```text
[Browser] ──(1)── [Caddy] ──(2)── [App replica] ──(3)── [Postgres]
     │                                  │
     │                                  ├──(4)── [Google/Microsoft OIDC]
     │                                  └──(5)── [LLM provider, optional]
     │
     └──(6)── [Crisis helplines via tel: links]
```

| Boundary | Controls |
|---|---|
| 1. Browser → edge | TLS; CSP; HSTS; 1 MB body cap; no access logs in Caddy |
| 2. Edge → app | Internal Docker network; health-gated routing; retries; timeouts |
| 3. App → DB | `db` network is `internal: true`; credentials in env; least-privilege DB user; statement logging suppressed |
| 4. App → IdP | Outbound HTTPS; client secret; PKCE; state/nonce; ID-token claim verification |
| 5. App → LLM | Scores-only or PII-scrubbed text; no identity; output guard; no request logging |
| 6. Student → helpline | Direct `tel:` link; no server involvement; works offline |

## Failure modes and designed responses

| Failure | Behaviour |
|---|---|
| Database unreachable | `/api/health` returns 503; Docker health check fails; Caddy removes the replica; pages error rather than serve stale personal data |
| LLM unavailable/refuses/times out | `summarize` and `reflect` fall back to clinician-written templates; chat may return `unavailable` at the page level if no provider is configured |
| Client offline during check-in submit | Score locally with the same `triage()`, show `/results/local`, mark "not saved" |
| Client offline on any other page | Service worker redirects navigation to `/crisis` |
| Two students book the same slot | Conditional `UPDATE … WHERE status='open'`; exactly one wins; loser sees "taken" |
| Two workers process the outbox | `FOR UPDATE SKIP LOCKED` claim; stale claims (>10 min) are reset |
| Alert unacknowledged | Escalation ladder pages backup, clinical lead, admin |
| No on-call shift | Alerts go to `ALERT_EMAILS` |
| No email transport in production | Outbox rows fail and go dead after 5 attempts; the staff dashboard warns that nobody will be paged |
| Stale browser after deploy | `NEXT_DEPLOYMENT_ID` triggers a hard reload instead of calling removed server functions |
| Migration fails | New replicas never start; old replicas keep serving (see Runbook) |
| Encryption key lost | All encrypted fields become unreadable; this is documented as irreversible |

## Architecture decisions and trade-offs

| Decision | Alternative | Why chosen |
|---|---|---|
| Deterministic triage, no LLM in the risk path | LLM risk classification | Reproducible, testable, works offline, auditable, cannot hallucinate risk |
| Pseudonym as primary key | Store email, encrypt later | A dump cannot be joined to institute records without the HMAC key |
| Field-level encryption with AAD | Whole-row or disk encryption | Partial exposure is limited; ciphertext cannot be transplanted between owners |
| Browser-held chat | Persisted chat with history | Removes a high-risk free-text store entirely |
| Postgres-backed rate limits | In-memory or Redis | No extra infrastructure; correct across replicas |
| Transactional outbox | Send email inside the request | Alert row and notification are atomic; delivery retries independently |
| Server actions for staff | REST for everything | Less client code, automatic CSRF posture via same-origin forms, revalidation built in |
| Static offline crisis page | App-shell offline mode | The one page that must work offline has no data dependencies |
| Forward-only migrations | Down migrations | Simpler, safer operational story; rollback is code-only within schema compatibility |

## Repository map

```text
src/
  app/
    (app)/            student-facing pages (shared shell)
    (staff)/          counsellor/admin pages + server actions
    api/              route handlers
    crisis/           static offline crisis page
    layout.tsx        root layout, fonts, metadata, SW registration
    manifest.ts       PWA manifest
    globals.css       design tokens and ambient styling
  components/
    checkin/ results/ exercises/ landing/ staff/   feature components
    ui.tsx, icons.tsx, Companion.tsx               primitives
  lib/
    auth/             identity, OIDC, sessions, guards
    checkin/          flow state machine, local results
    db/               Drizzle schema and connection
    i18n/             locale resolution and catalogs
    llm/              providers, prompts, output guard
    privacy/          pseudonym, field crypto, PII scrub
    safety/           triage, crisis detector, lexicons, helplines
    scales/           PHQ, GAD, WHO-5, C-SSRS scoring
    services/         business logic and persistence
  messages/           en.ts, hi.ts (all user-visible copy)
drizzle/              SQL migrations and snapshots
deploy/               compose, Caddy, cron, scripts
tests/                unit, integration, e2e
public/               icons, service worker
```

The file **counts by area** (source only, excluding tests): roughly 9.4k lines across `src/`.
The highest-risk code is small and isolated: `triage.ts` (~190 lines), `crisisDetector.ts`
(~75), `flow.ts` (~215), `booking.ts` (~340), `alerts.ts` (~320).

## Related reading

- [Frontend architecture](frontend-architecture.md)
- [Backend architecture](backend-architecture.md)
- [Data flow](data-flow.md)
- [Security architecture](security-architecture.md)
- [deployment.md](../deployment.md)
