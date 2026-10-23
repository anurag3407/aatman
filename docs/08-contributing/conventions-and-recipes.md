# Conventions and recipes

## Before you code

`AGENTS.md` warns that this Next.js version has breaking changes relative to common training
data. Read the relevant guide in `node_modules/next/dist/docs/` before changing framework-level
code. Do not assume older Next APIs.

Run the baseline:

```bash
pnpm install
pnpm setup:env
pnpm check
```

## Architecture rules

| Rule | Why |
|---|---|
| UI → services → DB; domain modules stay pure | Testability and clear boundaries |
| No React imports in `src/lib` | Keeps domain code runnable in tests and CLIs |
| No service imports in pure modules (`scales`, `safety`, crypto) | Determinism and reuse |
| Route handlers stay thin | All business rules live in services |
| Server components fetch; client components interact | Avoid private data in the client |
| Every student query filters by `pseudonym` | Ownership is enforced in SQL |
| Never trust client triage/role/consent | Server is the authority |
| Free text/chat are never stored | Core privacy invariant |
| All user copy lives in `src/messages/*` | i18n and clinical review |

## TypeScript and style

- Strict TypeScript; no `any` unless unavoidable and justified.
- Prefer discriminated unions for outcomes (`{ ok: true } | { ok: false; error }`).
- Use `type` for data shapes; `interface` where extension is intended.
- Keep functions small and named for intent.
- No default exports except pages/layouts/config files that require them.
- Comments explain *why*, not *what*. Do not narrate code.
- ESLint is authoritative; fix warnings rather than suppressing them. Existing suppressions
  are narrow and annotated.

## Naming

| Thing | Convention | Example |
|---|---|---|
| Files (components) | PascalCase | `CheckinFlow.tsx` |
| Files (modules) | camelCase | `fieldCrypto.ts` |
| Services | plural noun | `contactRequests.ts` |
| DB tables | snake_case plural | `contact_requests` |
| DB columns | snake_case | `shared_checkin_id` |
| TS fields | camelCase | `sharedCheckinId` |
| Reason codes | snake_case strings | `cssrs_high` |
| API routes | kebab-case segments | `/api/contact-requests` |
| Audit actions | snake_case | `view_contact_request` |

## Validation

- Every external input goes through zod.
- Env is validated once in `env.ts`; never read `process.env` directly elsewhere (except the
  documented `ALLOW_PGLITE_IN_PRODUCTION` escape hatch).
- Validate UUIDs with `isUuid` before queries.
- Strip unknown fields by parsing into a zod object.
- Put shared schemas in `src/lib/validation.ts`.

## Database

- Schema changes: edit `src/lib/db/schema.ts`, run `pnpm db:generate`, review SQL.
- Never hand-edit an applied migration or `_journal.json`.
- Owner-scoped queries include `pseudonym` in the `WHERE`.
- Use transactions when multiple writes must be atomic.
- Use conditional updates or row locks for concurrency, not read-then-write.
- Put encrypted values through `seal`/`unseal`; never handle keys in routes/components.
- Timestamps are `timestamptz`; display in IST.
- No soft deletes.

## Security and privacy

- Never log request bodies, answers, free text, chat, contact details, tokens, or secrets.
- Never add a route that returns individual data to admins.
- Never pass new fields to an LLM without classifying them and updating `scrubPii`.
- Never add a third-party origin to CSP without review.
- Never bypass the same-origin check on a mutation.
- Never change tier rules without tests and clinical review.
- Keep `mock` LLM and dev login impossible in production.

## Errors

- Expected business failures → typed results, mapped to HTTP codes at the boundary.
- Unexpected failures → let them throw; Next logs a 500.
- Client-facing error bodies are codes, not messages; copy comes from the catalog.
- Do not expose stack traces or provider errors to the browser.

## Tests

- Add tests with behaviour changes, especially in `src/lib/safety`, `src/lib/scales`,
  `src/lib/llm`, `src/lib/privacy`, and services.
- Use the real PGlite database for service tests.
- Inject `now` for time-dependent logic.
- Keep e2e tests independent and use accessible selectors.
- Never weaken the 100% crisis recall gate to make a change pass.

## Documentation

Update docs in the same PR when you change:

| Change | Docs |
|---|---|
| Table/column | [db.md](../04-data/db.md), [ERD](../04-data/erd-and-data-model.md) |
| Migration | [Migrations](../04-data/migrations.md) |
| Route/status | [API reference](../05-api/api-reference.md) |
| Tier/reason | [Safety triage](../03-domains/safety-triage.md), [clinical-review.md](../clinical-review.md) |
| Env var | [Configuration](../06-operations/configuration.md) |
| User flow | The flow doc + [journeys](../02-flows/user-journeys.md) |
| Retention | [Retention](../03-domains/retention-and-erasure.md) |
| Copy/locale | [i18n](../03-domains/i18n.md) |

## Commits and pull requests

- Commit messages: `type(scope): summary` (e.g. `fix(auth): bind oauth redirect to host`).
- One logical change per PR; include tests and docs.
- Describe the risk and how you verified it.
- Do not commit `.env.local`, dumps, keys, screenshots with student data, or `test-results/`.
- Do not bypass hooks (`--no-verify`) or signing.

---

# Recipes

## Add an API route

1. Create `src/app/api/<path>/route.ts`.
2. Start with:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { forbiddenOrigin, isSameOrigin, readJson } from "@/lib/http";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const auth = await requireApi(["student"], { consent: true });
  if (auth.error) return auth.error;
  const body = await readJson(req, schema);
  if (body.error) return body.error;
  // service call
  return NextResponse.json({ ok: true });
}
```

3. Add a zod schema in `validation.ts` if reused.
4. Add rate limiting if it is expensive or abusable.
5. Add the route to [api-reference.md](../05-api/api-reference.md).
6. Test auth, validation, ownership, and the happy path.

### Dynamic route params (Next 16)

```ts
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ...
}
```

## Add a table or column

1. Edit `src/lib/db/schema.ts`.
2. `pnpm db:generate`.
3. Review the SQL for locking/backfill implications.
4. Update services and types.
5. Update [db.md](../04-data/db.md) and [ERD](../04-data/erd-and-data-model.md).
6. Add/adjust tests; `pnpm test` applies migrations via PGlite.
7. If encrypted content changes, update sealing/unsealing and privacy docs.
8. For destructive changes, follow the checklist in [migrations.md](../04-data/migrations.md).

## Add a triage reason or change a tier rule

1. Add the reason to `TriageReason` and raise it in `triage()`.
2. Add a label to `REASON_LABELS` in `src/lib/staffLabels.ts`.
3. Add tests covering every path and precedence interaction.
4. Update [safety-triage.md](../03-domains/safety-triage.md) and
   [clinical-review.md](../clinical-review.md).
5. Get clinical lead sign-off.
6. Consider alert volume and student copy.

## Add a question to the check-in

1. Add the step id/kind in `src/lib/checkin/flow.ts` and place it in `sequence()`.
2. Map it in `toSubmission()` and the relevant answer type.
3. Add copy to `en.ts` and `hi.ts` (same structure).
4. Render it in `CheckinFlow.tsx` (`StepView`).
5. Decide whether it affects triage; if so, add a reason and tests.
6. Update [check-in flow](../02-flows/checkin-and-results.md).
7. Clinical review for any clinical item.

## Add or change copy

1. Add the English key first (`src/messages/en.ts`).
2. Add the Hindi equivalent with identical placeholders and array lengths.
3. Run `pnpm test tests/i18n`.
4. Clinical copy → clinical review.
5. Material consent change → bump `CONSENT_VERSION`.

## Add an LLM provider

1. Implement `LlmProvider` in `src/lib/llm/<name>.ts`.
2. Classify failures into `LlmFailure`.
3. Wire it in `getProvider()` and the `LLM_PROVIDER` enum in `env.ts`.
4. Add config to `.env.example` and `deploy/.env.example`.
5. Add failure-mode tests; ensure every path falls back.
6. Update [LLM and guardrails](../03-domains/llm-and-guardrails.md).
7. DPO review for data retention/terms.

## Add an exercise

1. Create `src/app/(app)/exercises/<name>/page.tsx`.
2. Create a client component in `src/components/exercises/` if interactive.
3. Store no personal data; if a download is offered, generate it client-side.
4. Add copy to both catalogs.
5. Add the card to `exercises/page.tsx`.
6. It is cached by the service worker after first visit (matches `/exercises/*`).

## Add a staff action

1. Add a `"use server"` function in `src/app/(staff)/actions.ts`.
2. `requireCounsellor()` first.
3. Parse `FormData` with zod.
4. Call a service that writes an audit row.
5. `revalidatePath` affected routes.
6. Add a form to the relevant staff page.
7. Update [counsellor workflow](../02-flows/counsellor-workflow.md) and the API reference.

## Change retention

1. Change the predicate/service and `RETENTION_MONTHS` default if needed.
2. Update [retention-and-erasure.md](../03-domains/retention-and-erasure.md) and the privacy
   notice copy.
3. Confirm the dashboard/history copy uses the configured value.
4. Add/adjust integration tests.
5. DPO review if the published window changes.

## Add an environment variable

1. Add it to the zod schema in `src/lib/env.ts` (with a safe default or explicit required).
2. Add it to `.env.example` and `deploy/.env.example` with a comment.
3. Use `env()`; do not read `process.env` directly.
4. If it is a secret, document rotation and loss impact.
5. Update [configuration.md](../06-operations/configuration.md).
6. Add production validation if a wrong value is unsafe.

## Debug a check-in that produced the wrong tier

1. Reproduce in a unit test with the same answers.
2. Inspect `triage().reasons` — the code that raised the tier is explicit.
3. Check whether the client submitted C-SSRS answers (positive item 9 requires them).
4. Check free text (not stored, so reproduce from the test/input).
5. Remember the server re-scores; a UI mismatch means the submitted answers differ from what
   the UI showed (e.g. pruned branches).
6. Do not "fix" by trusting the client.

## Debug an alert that did not arrive

1. Confirm the check-in tier was crisis/urgent (alert row exists).
2. Check `on_call_shifts` for an active window; otherwise `ALERT_EMAILS`.
3. Check outbox rows and `last_error`.
4. Check `NOTIFY_WEBHOOK_URL` and webhook logs.
5. Confirm cron is running.
6. See [Runbook](../06-operations/runbook.md#if-alerts-are-not-being-delivered).

## Related reading

- [Testing strategy](../07-quality/testing-strategy.md)
- [Backend architecture](../01-architecture/backend-architecture.md)
- [Security architecture](../01-architecture/security-architecture.md)
- [db.md](../04-data/db.md)
