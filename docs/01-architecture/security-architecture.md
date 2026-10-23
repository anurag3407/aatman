# Security architecture

## Scope and posture

Aatman handles mental-health data from students. The security posture is built around three
goals, in order:

1. **Do not create a database that identifies distressed students.**
2. **Do not let anyone (including admins) browse student records.**
3. **Do not let an AI or a client downgrade risk or leak content.**

The system assumes the network is hostile, the browser is untrusted, and a database dump may
eventually leak. It does **not** assume the server operator is hostile; an operator with root
and the encryption keys can decrypt data. That residual risk is explicit, not hidden.

## Assets

| Asset | Impact if exposed | Primary protection |
|---|---|---|
| Student identity ↔ check-ins | Severe (stigma, discrimination) | No identity stored; HMAC pseudonym |
| Answers and scores | Severe | AES-256-GCM, AAD-bound to owner |
| Free text | Severe | Never stored |
| Chat transcript | Severe | Never stored; scrubbed before LLM |
| Contact details | High | AES-256-GCM; counsellor-only with audit |
| Crisis alerts | Moderate | No answers/contact until opt-in; PII-free notifications |
| Session tokens | High | HS256 signed, httpOnly, SameSite=Lax, Secure in prod |
| Encryption/pseudonym keys | Catastrophic | Server env only; never in DB or backups |
| SSO client secrets | High | Server env; least-privilege OAuth client |
| Audit log | Moderate | No content; 36-month retention |
| Infrastructure credentials | High | Root-only env file (`umask 077`), no repo secrets |

## Trust zones

```text
┌──────────────────────────── untrusted ────────────────────────────┐
│ Browser (student, counsellor, admin, attacker)                    │
└───────────────┬───────────────────────────────────────────────────┘
                │ TLS, CSP, SameSite cookies, origin checks
┌───────────────▼──────────────── edge ─────────────────────────────┐
│ Caddy: TLS, 1 MB body cap, no access logs, header stripping       │
└───────────────┬───────────────────────────────────────────────────┘
                │ internal Docker network
┌───────────────▼──────────────── application ──────────────────────┐
│ Next.js replicas: authn/z, validation, rate limits, domain logic  │
│ Holds env secrets and decryption capability                       │
└───────┬───────────────────────────────┬───────────────────────────┘
        │ internal DB network           │ egress HTTPS
┌───────▼──────────── data ────────┐  ┌─▼──────────── external ─────┐
│ Postgres: ciphertext + metadata  │  │ IdP, LLM, email/SMS webhook │
└──────────────────────────────────┘  └─────────────────────────────┘
```

## Authentication

| Control | Implementation |
|---|---|
| Protocol | OIDC authorization code flow with PKCE (S256), state, nonce (`openid-client` v6) |
| Providers | Google Workspace, Microsoft Entra (single tenant) |
| Google hardening | Requires `email_verified === true` and an `hd` claim equal to an allowed domain, then checks the email domain |
| Microsoft hardening | Requires `tid === MICROSOFT_TENANT_ID`, then checks the email domain |
| Domain allow-list | `ALLOWED_EMAIL_DOMAINS` |
| Pending state | Signed JWT in `aat_o`, 10 min, path `/api/auth/callback`, httpOnly |
| Session | HS256 JWT in `aat_s`, 7 days, httpOnly, SameSite=Lax, Secure in production |
| Session contents | `sub` (pseudonym or `staff:<email>`), `role`, optional `email` for staff |
| Logout | Deletes the cookie; no server-side session store to revoke |
| Dev login | Only when `DEV_LOGIN=true` **and** `NODE_ENV !== "production"`; route returns 404 otherwise |

**Why no server-side session store:** sessions are stateless to allow any replica to serve any
request. The trade-off is that logout is client-side and a stolen token remains valid until
expiry. TTL is 7 days; the cookie is httpOnly and SameSite=Lax. A future revocation list
would require a new table and a per-request lookup.

## Authorisation

- Roles come from server-side allow-lists (`COUNSELLOR_EMAILS`, `ADMIN_EMAILS`). The client
  cannot choose a role.
- Page guards:
  - `requireStudentPage()` → session + role + current consent.
  - `requireStaffPage(roles)` → session + role; redirects students to `/`.
- API guard: `requireApi(roles, { consent })` → 401/403 JSON.
- **Ownership is enforced in SQL**, not by checking after fetch:
  `WHERE id = $id AND pseudonym = $pseudonym`.
- Staff access to student content is always through an explicit relationship:
  `contact_requests` or `slots.shared_checkin_id`.
- Admins have no route to individual data. The admin dashboard queries only aggregates.
- Priority-slot eligibility is enforced at booking time, not just hidden in the UI.

## CSRF

Cookie-authenticated mutations require same-origin:

```ts
// src/lib/http.ts
const site = req.headers.get("sec-fetch-site");
if (site) return site === "same-origin" || site === "none";
const origin = req.headers.get("origin");
return origin !== null && origin === new URL(env().APP_URL).origin;
```

- Applied to every mutating route handler.
- JSON routes additionally require `Content-Type: application/json` (cross-site HTML forms
  cannot send it).
- Sessions are SameSite=Lax, so cross-site POSTs do not carry the cookie in modern browsers.
- Server actions rely on Next.js's action protocol plus SameSite=Lax.
- OIDC login is a GET redirect, not a mutation.

## Input validation

- Every API body goes through zod (`src/lib/validation.ts`):
  - PHQ-9 array length 9, GAD-7 length 7, values 0–3 or null.
  - C-SSRS fields nullable booleans and a behaviour enum.
  - Free text max 4000 chars, at most 1 entry.
  - Phone regex and length; email format; chat turns max 40 × 2000 chars.
- UUID path params are checked with `isUuid` before querying.
- Server-action `FormData` is parsed with zod; `datetime-local` is interpreted as IST.
- Unknown fields are stripped by zod object parsing (no mass assignment).
- Length caps exist at the edge (1 MB) and in the schema.

## Output safety

LLM output is untrusted. `guardOutput` enforces:

- Non-empty and under 900 chars (summary) / 1200 chars (chat).
- No links or domains.
- No phone-like number except `14416`, `112`, `18008914416`.
- No diagnosis language (English and Hindi patterns).
- No medication names, dosage units, or "mg".
- No self-harm/death language and no crisis-lexicon match.
- Markdown emphasis/headings stripped.

Any failure falls back to clinician-written text. The guard is tested against a red-team set
(`tests/llm/redteam.ts`).

## Encryption

### Pseudonymisation

```text
pseudonym = "p_" + base64url(HMAC-SHA256(PSEUDONYM_KEY, email.trim().toLowerCase()))
```

- Keyed hash, not a plain hash: institute emails and roll numbers are guessable, so an
  unkeyed hash could be brute-forced.
- Stable across sessions, so history follows the student.
- Not anonymous: whoever holds the key can link an email to its data. `PSEUDONYM_KEY` must
  live in the server secret store, separate from database backups.

### Field encryption

```text
v1.<base64url( iv[12] | ciphertext | tag[16] )>
AES-256-GCM, key = base64-decoded DATA_ENCRYPTION_KEY (32 bytes)
AAD = owner pseudonym
```

- Fresh random IV per encryption.
- AAD binds ciphertext to the owner: moving a blob to another student's row causes
  authentication failure.
- Version prefix allows future key/algorithm migration.
- Encrypted fields: `checkins.payload_enc`, `checkins.summary_enc`,
  `contact_requests.contact_enc`, `slots.contact_enc`, `crisis_alerts.note_enc`.
- Plaintext by design: tier, timestamps, statuses, slot metadata, audit ids, rate-limit
  counters. These are needed for operations and aggregates and reveal no answers.

### Key management

| Key | Purpose | Loss impact | Rotation |
|---|---|---|---|
| `SESSION_SECRET` | Sign sessions and temp OIDC state | All sessions invalid; users re-login | Safe to rotate |
| `PSEUDONYM_KEY` | Email → pseudonym | **All accounts orphaned**; history unreachable | Avoid; requires re-linking design |
| `DATA_ENCRYPTION_KEY` | Field encryption | **All encrypted content unreadable** | Requires re-encryption migration |
| `CRON_SECRET` | Authenticate cron endpoints | Jobs fail (401) | Safe to rotate with scheduler update |
| SSO client secret | Token exchange | Login fails | Rotate at IdP and app together |

Keys are supplied via environment only. They must not be committed, logged, or stored with
database backups.

## LLM boundary

| Data | Summary path | Chat path |
|---|---|---|
| Identity | Never | Never |
| Pseudonym | Never | Never |
| Answers/items | Never | Never |
| Scores | Never (bands only) | Never |
| Free text | Never (dropped before storage) | Scrubbed, last 12 turns |
| Campus booleans | Four booleans | Never |
| Tier | Yes (needed for tone) | Never |

Additional controls:

- Default provider is `none`; every feature works without an LLM.
- `mock` is refused in production by env validation.
- Timeouts (`LLM_TIMEOUT_MS`, default 20 s), one retry for Anthropic.
- No request or response content in logs; only failure class/status.
- Anthropic refusal fallback can be disabled (`LLM_REFUSAL_FALLBACK=false`) for data
  agreements requiring a single model.
- The OpenAI-compatible adapter enables self-hosted models so data can stay on institute
  infrastructure.

## HTTP security headers

From `next.config.ts`:

| Header | Value | Notes |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` | Production only; `unsafe-inline` is required by Next's bootstrap |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Production only |
| `X-Content-Type-Options` | `nosniff` | All environments |
| `X-Frame-Options` | `DENY` | All environments |
| `Referrer-Policy` | `no-referrer` | Prevents URL leakage to external links |
| `Permissions-Policy` | camera/mic/geolocation disabled | All environments |
| `Cache-Control` on `/api/*` | `no-store` | Personal data never cached |
| `Cache-Control` on `/sw.js` | `no-cache, no-store, must-revalidate` | Worker updates take effect |

`frame-ancestors 'none'` plus `X-Frame-Options: DENY` prevents clickjacking.

## Infrastructure hardening

From `deploy/`:

- Caddy obtains TLS automatically; HTTP/3 enabled; `request_body max_size 1MB`; `-Server`
  header removed; **no access log** (student paths/IPs stay off disk).
- App containers: non-root UID 1001, `read_only: true`, `tmpfs` for `/tmp` and Next cache,
  `cap_drop: ALL`, `no-new-privileges`, memory/CPU limits, health check.
- Postgres: not published to the host, `db` network is `internal: true`, SCRAM auth,
  `log_min_error_statement=panic` so statement text never reaches logs.
- Only ports 80/443 (and SSH) open; UFW default-deny incoming.
- fail2ban for SSH; password SSH disabled when keys exist; unattended upgrades; 2 GB swap on
  small VPS.
- Release artifacts are built from `git archive` of `HEAD`; uncommitted changes are not
  deployed.
- Backups are `pg_dump` ciphertext with 14-day retention, stored outside the app container;
  they do not include encryption keys.

## Logging and observability

Allowed in logs:

- Error class/status (`anthropic 429`, `webhook_500`).
- Aggregate job results (`escalated`, `sent`, `failed`).
- Health check failures.
- Startup configuration errors (variable names, not values).
- In development only: notification recipient + subject; SMS last four digits.

Never logged:

- Request bodies, answers, free text, chat text, contact details.
- Session tokens, OIDC codes, secrets.
- SQL statement text in Postgres.
- Student paths or IPs at the edge (no Caddy access log).

## Threat model

| # | Threat | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|---|
| T1 | Stolen database dump | Medium | Severe | No identity; field encryption; free text absent | Tier/timestamps visible; key-holder can decrypt |
| T2 | Student account takeover via SSO | Low | High | IdP MFA (institute policy), domain/tenant checks, httpOnly session | Attacker sees that student's data |
| T3 | Staff account takeover | Low | Severe | SSO, least privilege, audit, no bulk export | Attacker can read shared records while session lives |
| T4 | Admin overreach | Low | High | Admin has aggregates only; no API returns individuals | None via app |
| T5 | Malicious client downgrades risk | Medium | Severe | Server re-scores; client triage ignored | None |
| T6 | Prompt injection via chat | Medium | Moderate | Deterministic crisis check; PII scrub; output guard; no tools; chat is stateless | Model may produce poor but guarded text |
| T7 | LLM leaks identifiers | Low | Severe | Scrubbing + zero-retention provider assumption + no identity in prompts | Heuristic scrub is not NER |
| T8 | Made-up helpline in LLM output | Medium | High | Number allow-list in guard; templates | None if guard runs (it always does) |
| T9 | CSRF on mutations | Low | High | SameSite=Lax + origin check + JSON content type | None known |
| T10 | XSS | Low | Severe | No `dangerouslySetInnerHTML`; React escaping; CSP | `unsafe-inline` weakens CSP |
| T11 | Booking race / double-book | Medium | Moderate | Conditional update; row locks | None |
| T12 | Alert storm / double-page | Medium | Moderate | Per-check-in alert; skip-locked claims; escalation idempotence | Duplicate email under rare crash window |
| T13 | Cron endpoint abuse | Low | High | 32+ char secret, constant-time compare | Secret leakage |
| T14 | Key loss | Low | Catastrophic | Documented, separate storage, backups exclude keys | No recovery path by design |
| T15 | Operator malice | Low | Catastrophic | Least privilege, audit, separation of duties | Root + keys can decrypt |
| T16 | Dependency compromise | Low | High | Small dependency set; lockfile; no third-party runtime scripts | Supply-chain risk remains |
| T17 | Offline cache leaks on shared device | Medium | Moderate | Only `/crisis` and exercises cached; quick exit clears sessionStorage | Cached exercises remain in Cache Storage |
| T18 | Shoulder-surfing / shared hostel device | Medium | High | Neutral branding, quick exit, no persistent chat | Student must use quick exit |

## Secure development rules

1. Never log request bodies or student text.
2. Never add a route that returns individual student data to an admin.
3. Never trust client-computed triage, role, or consent.
4. Never store free text, chat, or identity without a privacy review.
5. Never add a third-party origin to CSP without explicit review.
6. Never pass a new field to the LLM without classifying it and updating the PII scrubber.
7. Never change tier rules without updating tests and the clinical review.
8. Never commit `.env`, keys, dumps, or screenshots containing student data.
9. Keep the `mock` provider and dev login impossible in production (env enforcement).
10. Use parameterised queries via Drizzle; do not interpolate user input into SQL.

## Incident pointers

Operational steps (rotate keys, disable SSO, preserve audit, notify DPO) are in the
[Runbook](../06-operations/runbook.md#incident-response). Key-compromise consequences and
what a dump reveals are in [privacy-and-crypto.md](../03-domains/privacy-and-crypto.md).

## Related reading

- [Privacy and crypto](../03-domains/privacy-and-crypto.md)
- [privacy-and-security.md](../privacy-and-security.md)
- [Data flow](data-flow.md)
- [Testing strategy](../07-quality/testing-strategy.md)
- [Runbook](../06-operations/runbook.md)
