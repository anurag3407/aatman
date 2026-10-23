# Testing strategy

## Philosophy

Tests here protect safety properties, not just code coverage. The highest-value tests are
deterministic checks of clinical routing, crisis recall, privacy invariants, and concurrency.
UI polish is covered by a smaller e2e set.

Three rules:

1. **Safety rules are tested at boundaries.** Every cutoff, every C-SSRS path, every
   escalation threshold.
2. **Integration tests use a real database.** PGlite runs the actual migrations and SQL; no
   mocked queries.
3. **Critical journeys run in a browser.** Crisis, offline, booking, chat safety, and erasure
   are exercised end to end.

## Commands

```bash
pnpm typecheck     # next typegen + tsc --noEmit
pnpm lint          # eslint
pnpm test          # vitest run (unit + integration)
pnpm test:watch    # vitest
pnpm check         # typecheck + lint + test
pnpm test:e2e      # Playwright (builds production + runs two servers)
```

`pnpm check` is the minimum pre-merge gate.

## Test environments

### Vitest (`vitest.config.ts`)

- Includes `tests/**/*.test.ts`.
- Aliases `@` → `src`.
- Aliases `server-only` → an empty module so server code can run directly.
- Injects:
  - `NODE_ENV=test`
  - `DATABASE_URL=pglite:memory` (each test file gets its own DB)
  - fixed, non-secret session/pseudonym/encryption keys
  - `ALLOWED_EMAIL_DOMAINS=nitp.ac.in`
  - `LLM_PROVIDER=mock`
- 20-second test timeout.

### Playwright (`playwright.config.ts`)

- Mobile viewport (Pixel 7).
- Serial (`workers: 1`, `fullyParallel: false`).
- Two projects:

| Project | Target | Purpose |
|---|---|---|
| `offline` | production build on port 3123 | Service worker behaviour |
| `flows` | dev server on port 3124 | Dev login, mock LLM, full journeys |

- Production server env: `ALLOW_PGLITE_IN_PRODUCTION=true`, dummy Google client, cron secret.
- Dev server env: `DEV_LOGIN=true`, `LLM_PROVIDER=mock`.
- `reuseExistingServer` outside CI for faster local loops.

## Suite map

| Suite | File(s) | Guards |
|---|---|---|
| Scales | `tests/scales/scales.test.ts` | Every published cutoff and band; proration; C-SSRS table |
| Triage | `tests/safety/triage.test.ts` | Tier precedence, item-9 paths, text escalation, ragging, validation |
| Crisis detector | `tests/safety/crisisDetector.test.ts`, `golden.ts` | Normalisation; **100% recall**; ragging; max-level aggregation |
| Check-in flow | `tests/checkin/flow.test.ts` | Question order, always item 9, C-SSRS branching, early stop, deeper offer, back/re-route, submission |
| LLM | `tests/llm/llm.test.ts`, `redteam.ts` | Guard red-team set, markdown, templates, chat pause, fallback |
| Privacy | `tests/privacy/privacy.test.ts` | Pseudonym stability/key dependence; AES round-trip, IV, AAD binding, tamper; PII scrub |
| Services | `tests/services/services.test.ts` | Encryption at rest, free text never stored, ownership, booking race, export/erasure, retention, rate limits, k-anonymity |
| Alerts | `tests/services/alerts.test.ts` | Alert creation, PII-free messages, ack/resolve, escalation, retries, routing, retention |
| Access/booking | `tests/services/access.test.ts` | Profiles, priority eligibility, atomic reschedule, attendance, reminders |
| Auth identity | `tests/auth/identity.test.ts` | Google `hd`/verified, Microsoft tenant, domains, roles |
| Env | `tests/env/env.test.ts` | Empty values, short secrets, production safety gates |
| i18n | `tests/i18n/messages.test.ts` | Structure parity, items present, Devanagari, placeholders |
| E2E journeys | `tests/e2e/checkin.spec.ts`, `features.spec.ts` | Consent-first, mild/crisis/deeper paths, minor mode, CSRF/auth, staff access, booking, chat, Hindi, quick exit, exercises, export/erase |
| E2E offline | `tests/e2e/offline-crisis.spec.ts` | Crisis page offline, navigation fallback, exercise cache, bilingual |

## What each critical property is tested by

| Property | Test |
|---|---|
| A positive item 9 never yields mild/moderate | `triage.test.ts` |
| High-risk C-SSRS stops the check-in | `flow.test.ts`, `checkin.spec.ts` |
| Crisis text overrides low scores | `triage.test.ts`, `checkin.spec.ts` |
| 100% crisis recall on golden set | `crisisDetector.test.ts` |
| Free text is never stored | `services.test.ts` |
| Ciphertext cannot be moved between owners | `privacy.test.ts` |
| Server re-scores and ignores client tier | `services.test.ts` |
| Exactly one of two bookings wins | `services.test.ts` |
| Alerts are PII-free | `alerts.test.ts` |
| Escalation stops on acknowledgement | `alerts.test.ts` |
| Unsafe model output is replaced | `llm.test.ts` |
| Battle-tested crisis chat pause | `features.spec.ts` |
| Under-18 mode sends nothing | `checkin.spec.ts` |
| Offline crisis page works | `offline-crisis.spec.ts` |
| Admins see aggregates only | `checkin.spec.ts` |
| Hindi catalog stays structurally complete | `messages.test.ts` |
| Production refuses unsafe config | `env.test.ts` |

## The 100% recall gate

`crisisDetector.test.ts` fails if any golden phrase is not matched at or above its expected
level. This is intentionally strict:

- It prevents a refactor from silently weakening detection.
- It forces every new phrase to be classified.
- It makes lexicon changes reviewable.

It does **not** prove real-world recall. The golden set must grow with real, anonymised
phrasing; the clinical lead owns that expansion.

## Test doubles

| Dependency | Double | Notes |
|---|---|---|
| Database | PGlite in-memory + real migrations | Actual SQL and constraints |
| LLM | `MockProvider` | Deterministic; markers for unsafe/refusal/error |
| Email/SMS | Injected `send` functions | Assert delivery/retry without network |
| Time | `now` parameters in services | Deterministic escalation/reminders |
| Env | `resetEnvCache()` | Per-test configuration |
| Provider | `resetProviderCache()` | Swap adapters |

## Writing a test

### Unit/domain

```ts
import { describe, it, expect } from "vitest";
import { triage } from "@/lib/safety/triage";

it("never drops below elevated when item 9 is positive", () => {
  const result = triage({
    phq9: [0,0,0,0,0,0,0,0,1],
    gad7: [0,0,0,0,0,0,0],
  });
  expect(result.tier).toBe("elevated");
});
```

### Integration/service

Use the real DB; create rows through services rather than raw inserts where possible. Set
`now` explicitly for time-sensitive logic. Assert ciphertext shape with `unseal` or by reading
the row directly.

### E2E

Prefer role/label selectors used by the actual UI. Keep tests independent: each test signs in
through the dev form and creates its own data. The suite is serial because the dev database is
shared within the run.

## Gaps and risks

| Gap | Consequence | Suggested response |
|---|---|---|
| No visual regression tests | Layout/Hindi overflow can slip | Add screenshots for key pages in both locales |
| No load test | Capacity assumptions untested | k6/artillery against staging |
| No accessibility automation | A11y regressions possible | axe-core in Playwright |
| No real-provider contract tests | Anthropic/compat adapters only unit-shaped | Staging smoke with a test key |
| Hindi clinical validity | Structural tests, not clinical | Clinician review |
| Crisis lexicon depth | 62 entries, small golden set | Expand to 300+ with real phrasing |
| No chaos/failover test | Escalation under crash untested | Drill in staging |
| No browser matrix | Only Chromium Pixel 7 | Add WebKit/Firefox if supported |
| No DB migration upgrade test from old data | Forward-only assumptions | Snapshot test with a production-like dump |

## CI recommendation

Minimum pipeline:

```text
pnpm install --frozen-lockfile
pnpm check                 # typecheck + lint + vitest
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

Fail the build on:

- any type/lint error,
- any unit/integration failure,
- below-100% crisis recall,
- any e2e failure,
- (recommended) `pnpm audit --prod` high/critical advisories.

Do not run e2e against production data. Use the test env with PGlite and the mock provider.

## Adding a safety test

Any change to `triage.ts`, `flow.ts`, scales, lexicon, prompts, or the output guard should add
or update a test in the matching suite. A safety change without a test should be rejected in
review.

## Related reading

- [clinical-review.md](../clinical-review.md)
- [Safety triage](../03-domains/safety-triage.md)
- [Crisis detection](../03-domains/crisis-detection.md)
- [Conventions and recipes](../08-contributing/conventions-and-recipes.md)
