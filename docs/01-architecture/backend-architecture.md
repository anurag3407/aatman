# Backend architecture

## Overview

The backend is server-side TypeScript running inside Next.js. There is no separate API
service. Business logic lives in `src/lib/services/` and pure domain modules; HTTP route
handlers and server actions are thin adapters around those services.

```text
Route handler / server action
  ├─ CSRF / same-origin
  ├─ session + role + consent guard
  ├─ rate limit (where applicable)
  ├─ zod validation
  └─ service call
        ├─ pure domain logic (scales, triage, crypto, guard)
        ├─ Drizzle query / transaction
        └─ audit or outbox write
```

## Module layout

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/db` | Connection singleton, schema export | env |
| `lib/env` | Validated configuration, production gates | zod |
| `lib/http` | Same-origin check, JSON parsing, redirects | env, zod |
| `lib/auth` | Identity claims, OIDC, sessions, guards | env, db, audit, privacy |
| `lib/privacy` | Pseudonym, field crypto, PII scrub | env |
| `lib/scales` | Pure scoring functions | none |
| `lib/safety` | Triage, crisis detector, helplines | scales |
| `lib/checkin` | Flow state machine, local result types | scales, safety |
| `lib/llm` | Providers, prompts, output guard, summarize/reflect | env, safety, privacy, i18n |
| `lib/services` | Persistence and business operations | db, privacy, domain, notify |
| `lib/notify` | Email/SMS webhooks with dev fallbacks | env |
| `lib/i18n` | Catalogs and locale resolution | messages |

### Services inventory

| Service | Key exports | Tables |
|---|---|---|
| `checkins` | `createCheckin`, `getCheckin`, `listCheckins`, `latestCheckin`, `saveSummary`, `setKeep` | `checkins`, `crisis_alerts`, `notification_outbox` |
| `contactRequests` | `createContactRequest`, list/get/update, student list | `contact_requests`, `checkins`, `crisis_alerts` |
| `booking` | `listOpenSlots`, `bookSlot`, `cancelBooking`, `rescheduleBooking`, `createSlots`, staff views, `markAttendance` | `slots`, `counsellors`, `checkins`, `audit_log` |
| `alerts` | recipient routing, alert CRUD, escalation, outbox processing | `crisis_alerts`, `on_call_shifts`, `notification_outbox`, `audit_log` |
| `reminders` | `runAppointmentReminders` | `slots`, `counsellors` |
| `retention` | `runRetention` | all data tables, `audit_log` |
| `studentData` | `exportStudentData`, `eraseStudent`, `recordConsent` | `students`, `checkins`, `contact_requests`, `slots`, `audit_log` |
| `aggregates` | `weeklyTierCounts`, `serviceStats`, suppression helpers | `checkins`, `slots`, `contact_requests` |
| `rateLimit` | `rateLimit`, `sweepRateLimits` | `rate_limits` |
| `audit` | `recordAudit` | `audit_log` |
| `counsellors` | profile upsert/list/get | `counsellors`, `audit_log` |

## Database access

### Connection (`src/lib/db/index.ts`)

- `getDb()` returns a cached promise stored on `globalThis` to survive dev hot reloads.
- If `DATABASE_URL` starts with `pglite:`:
  - `pglite:memory` → in-process database.
  - `pglite:<path>` → persistent local database; parent directory is created.
  - Migrations are applied automatically on connect.
- Otherwise a `pg.Pool` is created with `max = DATABASE_POOL_MAX`,
  `idleTimeoutMillis = 30_000`, `connectionTimeoutMillis = 5_000` (fail fast for health
  checks).
- The client is typed as `NodePgDatabase<typeof schema>`; both drivers expose the same query
  builder for the operations used here.

**Production migrations are not automatic** in the VPS stack: the release pipeline runs the
`migrate` image before starting app replicas. The Render path runs `scripts/migrate.mjs` from
`scripts/start.sh` if `DATABASE_URL` is a `postgres://` URL.

### Schema

All tables are defined in `src/lib/db/schema.ts`; SQL migrations live in `drizzle/`. See
[db.md](../04-data/db.md) for the canonical reference.

### Query conventions

- Every student-scoped read/write filters by `pseudonym` in the `WHERE` clause, never only by
  record id. Example: `getCheckin` uses `and(eq(id), eq(pseudonym))`.
- UUID inputs are validated with `isUuid` before querying.
- Soft-deleted/archived states are not used; deletion is real (with cascades) except for
  historical booking rows.
- Aggregates use SQL (`count`, `filter`, `percentile_cont`, `date_trunc`) rather than loading
  rows.

## Transactions and concurrency

| Operation | Technique | Guarantee |
|---|---|---|
| Check-in + alert + outbox | Single `db.transaction` | No alert without a check-in, no check-in with a missing alert |
| Booking | Conditional `UPDATE … WHERE status='open'` | Exactly one winner under concurrency |
| Reschedule | Transaction + `SELECT … FOR UPDATE` on both slots | Old slot released only if new one is secured |
| Alert escalation | Transaction + `FOR UPDATE SKIP LOCKED` | Two instances never double-page |
| Outbox claim | Transaction + `SKIP LOCKED` limit 20 | Each message claimed once; stale claims reset |
| Erasure | Transaction: free bookings → delete student (cascade) | No orphaned personal data |
| Contact request | Insert, then link open alerts in a second statement | Callback data attached to the active alert |

### Booking race, precisely

`bookSlot` first checks the slot, eligibility, and cap, then performs:

```sql
UPDATE slots
   SET status='booked', booked_by=$pseudonym, booked_at=now(), ...
 WHERE id=$slot AND status='open' AND starts_at > now()
RETURNING id;
```

If the update returns no row, another request won and the caller receives `taken`. The
pre-checks are advisory; the conditional update is the authority.

### Outbox claim, precisely

1. Reset `sending` rows whose `claimed_at` is older than 10 minutes to `pending`.
2. In a transaction, select up to 20 due `pending` rows `FOR UPDATE SKIP LOCKED`, ordered by
   `created_at`.
3. Mark them `sending` with `claimed_at = now`.
4. Deliver **outside** the claim transaction.
5. On success: `sent`, increment attempts.
6. On failure: `pending` with backoff 1/5/15/60 min, or `dead` after 5 attempts.

## HTTP layer

### Route handler pattern

Every mutating handler follows the same skeleton:

```ts
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"], { consent: true });
  if (auth.error) return auth.error;
  if (!(await rateLimit(`action:${auth.session.sub}`, N, windowMs))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = await readJson(req, schema);
  if (body.error) return body.error;
  // ... service call
}
```

`readJson` requires `Content-Type: application/json`, parses JSON, and validates with zod.
Invalid body → `400 { error: "invalid_body" }`; wrong content type → `415`.

### Error model

| Status | Meaning | Body |
|---|---|---|
| 400 | Invalid input, missing check-in, invalid UUID | `{ "error": "invalid_body" \| "not_found" \| ... }` |
| 401 | No/invalid session | `{ "error": "unauthenticated" }` |
| 403 | Wrong role, consent missing, bad origin, ineligible priority slot | `{ "error": "forbidden" \| "consent_required" \| "bad_origin" \| "not_eligible" }` |
| 404 | Record not found or not owned | `{ "error": "not_found" }` |
| 409 | Conflict (slot taken, too many bookings) | `{ "error": "taken" \| "too_many" }` |
| 415 | Wrong content type | `{ "error": "expected_json" }` |
| 429 | Rate limit or cap exceeded | `{ "error": "rate_limited" }` or `{ "type": "limit" }` |
| 503 | Database unhealthy | `{ "ok": false }` (health only) |

Services return discriminated unions such as `BookResult`, not exceptions, for expected
business failures. Unexpected failures propagate and become 500s; error messages are logged
without request content.

### Server actions

Staff actions are invoked from `<form action={...}>`. They:

1. Call `requireCounsellor()` (session role `counsellor`, email present).
2. Parse `FormData` with zod.
3. Interpret `datetime-local` values as IST (`+05:30`).
4. Call the service.
5. `revalidatePath` the affected routes.

They do not use the JSON route-handler helpers. Next.js's server-action protocol provides
its own origin protections, and the session cookie is SameSite=Lax.

## Authentication and authorisation

- OIDC discovery is cached per provider in a `Map<Provider, Promise<Configuration>>`; failed
  discovery is evicted so the next request retries.
- Pending login state (provider, PKCE verifier, state, nonce) is signed into `aat_o` for
  10 minutes, scoped to the callback path.
- The callback rebuilds its URL from `x-forwarded-host`/`host` (or `APP_URL`), then exchanges
  the code and verifies state/nonce/PKCE.
- Identity claims are evaluated by pure `evaluateIdentity` (Google `hd` + `email_verified`;
  Microsoft `tid` tenant; allow-listed domain).
- `createSessionFor` inserts a `students` row for first-time students and applies a consent
  carry-over cookie if present.
- Staff logins are audited as `staff_login`.

Details: [Onboarding and authentication](../02-flows/onboarding-and-auth.md).

## Privacy operations

- `seal(value, ownerPseudonym)` and `unseal` are used only in services. Route handlers never
  handle raw encryption keys.
- Free text is removed from the stored payload before sealing:
  `const { freeText, ...answers } = input.answers`.
- `textDetection` is removed from the persisted triage (`toPublicTriage`) because matched rule
  ids hint at what the student wrote.
- PII scrubbing happens only in `reflect()` before an LLM call.
- Export decrypts everything for the owner; erasure deletes the student row and relies on
  cascades.

## Background work

There is no queue service. Background work is HTTP-triggered by a scheduler and protected by
`CRON_SECRET` using a constant-time comparison.

| Job | Endpoint | Schedule (reference) | Work |
|---|---|---|---|
| Alerts | `POST /api/cron/alerts` | every minute | escalation + outbox + SMS reminders |
| Retention | `POST /api/cron/retention` | daily 21:30 UTC (03:00 IST) | delete expired rows |
| Backup | `deploy/cron/backup.sh` | daily 21:00 UTC (02:30 IST) | `pg_dump`, 14-day retention |

The cron container runs busybox `crond`; because crond does not inherit container
environment, `entrypoint.sh` writes the needed variables to `/run/cron.env` (mode 0600) and
each job sources it.

`/api/cron/alerts` performs three tasks in order and returns a summary:
`{ escalated, claimed, sent, failed, reminders: { sent, failed } }`.

## Rate limiting

Postgres fixed-window counters:

```sql
INSERT INTO rate_limits (key, window_start, count) VALUES ($hashedKey, $now, 1)
ON CONFLICT (key) DO UPDATE SET
  window_start = CASE WHEN window_start <= $now - $window THEN $now ELSE window_start END,
  count        = CASE WHEN window_start <= $now - $window THEN 1 ELSE count + 1 END
RETURNING count;
```

- Keys are SHA-256 hashed before storage, so a row does not name a person.
- One atomic upsert; correct across replicas.
- Retention sweeps counters older than 24 h.

Current limits:

| Action | Limit | Window |
|---|---|---|
| Check-in submission | 10 per student | 1 hour |
| Summary generation | 20 per student | 1 hour |
| Chat turn | 40 per student | 1 hour |
| Open contact requests | 3 (business cap, not rate limit) | — |
| Upcoming bookings | 2 (business cap) | — |

## Notifications

`src/lib/notify/index.ts`:

- `sendEmail`: POSTs `{ to, subject, text }` to `NOTIFY_WEBHOOK_URL` with optional bearer
  token and a 10 s timeout. In non-production without a webhook it logs only the recipient and
  subject.
- `sendSms`: POSTs `{ to, text }` to `SMS_WEBHOOK_URL`. In non-production it logs only the
  last four digits.
- In production with no transport, delivery returns `no_transport` and the outbox retries then
  marks the message dead. The staff alerts page warns when email is not configured.

## Configuration and startup

`env()` validates once and caches. In production it refuses to start when:

- `DEV_LOGIN=true`
- `LLM_PROVIDER=mock`
- `DATABASE_URL` is `pglite:*` unless `ALLOW_PGLITE_IN_PRODUCTION=true`
- `CRON_SECRET` is missing
- Neither Google nor Microsoft SSO is configured

Empty strings are treated as unset, which makes `.env` templates safe.

## Failure and fallback matrix

| Layer failure | Fallback |
|---|---|
| LLM provider missing | `summarize` returns template; `/chat` shows an unavailable state |
| LLM refusal/timeout/empty/unsafe | Template summary or chat fallback text |
| Email transport missing | Outbox retries then dead; dashboard warning |
| SMS transport missing | Reminder attempts recorded, no message sent |
| Database down | Health 503; requests fail rather than serve stale data |
| No on-call shift | `ALERT_EMAILS` fallback |
| Missing slot data | Booking page shows helplines instead |
| PGlite in local dev | Auto-migrates on connect; no external service needed |

## Testing hooks

- `resetEnvCache()` clears the memoised env.
- `resetProviderCache()` swaps LLM providers in tests.
- Services accept injectable `now` and, for reminders/outbox, an injectable `send` function.
- Vitest aliases `server-only` to an empty module so server code runs directly.

## Related reading

- [API reference](../05-api/api-reference.md)
- [db.md](../04-data/db.md)
- [Alerts and escalation](../03-domains/alerts-and-escalation.md)
- [Privacy and crypto](../03-domains/privacy-and-crypto.md)
- [Conventions and recipes](../08-contributing/conventions-and-recipes.md)
