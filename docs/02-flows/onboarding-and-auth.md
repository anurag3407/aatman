# Onboarding and authentication

## Entry and consent

The application enforces consent **before** account creation. The student sees what is stored
before an email is pseudonymised.

```text
/checkin (no session)
  → redirect /consent
      age gate
        ├─ under 18 → /checkin?mode=stateless (no account, no server writes)
        └─ 18+ → agree
              ├─ signed in  → POST /api/consent → record → /checkin
              └─ signed out → POST /api/consent → set aat_c (30 min) → /signin
```

### Consent versioning

- `CONSENT_VERSION = "2026-10-v1"` in `src/lib/consent.ts`.
- Bump it when the consent text changes materially.
- `hasCurrentConsent()` compares the stored version to the constant.
- A student on an older version is redirected to `/consent` before any saved action; the page
  shows an "updated" banner and requires re-agreement.
- The consent cookie (`aat_c`) exists only to carry agreement across the OIDC redirect. It is
  httpOnly, SameSite=Lax, Secure in production, 30 minutes, and deleted by the login callback.

### Age gate

The form asks age first. Under-18s are routed to stateless mode, because DPDP requires
verifiable parental consent for processing children's data and the app does not implement
guardian verification. The minor path:

- no sign-in
- no server-side check-in
- results in `sessionStorage` only
- explicit banner: "These results are only on this device and disappear when you close the
  tab."

This is a deliberate product limitation, not a technical workaround.

## Providers

| Provider | Configuration | Verification |
|---|---|---|
| Google Workspace | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `email_verified === true`; `hd` must equal an allowed domain; email domain must be allowed |
| Microsoft Entra | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | `tid === MICROSOFT_TENANT_ID`; email (or `preferred_username`) domain must be allowed |
| Dev login | `DEV_LOGIN=true` and `NODE_ENV !== "production"` | Email must end with an allowed domain; role from allow-lists |

Why `hd` matters: an email address ending in the institute domain is not proof that the
account is institute-managed. The Google `hd` claim is set only for Workspace-managed
accounts, blocking consumer Gmail accounts that happen to have a matching address.

Why the Entra tenant matters: a multi-tenant app could accept any Microsoft account. Pinning
the issuer to the institute tenant prevents that.

## OIDC sequence

```text
GET /api/auth/login/google
  provider check (google|microsoft)
  beginLogin(provider, host)
    discovery (cached)
    verifier = randomPKCECodeVerifier()
    state    = randomState()
    nonce    = randomNonce()
    redirect_uri = https://<host>/api/auth/callback/<provider>
    scope = openid email profile
    code_challenge = S256(verifier)
    prompt = select_account
    (Google only) hd hint = first allowed domain
  set aat_o = signTemp({provider, verifier, state, nonce}, 600)
      httpOnly, Secure in prod, SameSite=Lax, path=/api/auth/callback
  302 to IdP

GET /api/auth/callback/google?code&state
  verify aat_o; provider must match
  rebuild callback URL from x-forwarded-host/host or APP_URL
  finishLogin(): authorizationCodeGrant with verifier, expected state and nonce
  evaluateIdentity(claims, policy)
  createSessionFor(email, role, { consentVersion: aat_c })
  loginRedirect(landingPathFor(role))
      set aat_s session cookie
      delete aat_c
      delete aat_o (path-scoped)
  303 to landing
```

### Host binding

The redirect URI is derived from the incoming `x-forwarded-host` or `host` header, falling
back to `APP_URL`. This supports deployments behind a proxy without hardcoding the host, and
matches the recent fix "dynamically bind oauth redirect uri to incoming host". The IdP must
have the resulting URI registered exactly. A mismatch causes the IdP to reject the request
before the callback runs.

### Pending-state protection

`aat_o` is signed with `SESSION_SECRET` (HS256) and expires in 10 minutes. It carries the PKCE
verifier, state, and nonce. It is scoped to the callback path so it is not sent to other
routes. An attacker cannot forge it without the session secret, and a stale or mismatched
provider redirects to `/signin?error=failed`.

## Identity evaluation

```ts
evaluateIdentity(provider, claims, policy)
  rawEmail = claims.email ?? (microsoft ? claims.preferred_username : undefined)
  reject if missing or no "@"
  email = trim().toLowerCase()
  google:
    reject if email_verified !== true        → "unverified"
    reject if hd not in allowedDomains       → "wrong_domain"
  microsoft:
    reject if !tenantId or tid !== tenantId  → "wrong_tenant"
  reject if email domain not allowed         → "wrong_domain"
  role = admin if in ADMIN_EMAILS
         counsellor if in COUNSELLOR_EMAILS
         student otherwise
```

The domain check after the provider-specific check catches malformed or mismatched claims
(e.g. an `hd` that does not match the email domain).

## Session creation

### Student

```text
pseudonym = HMAC-SHA256(PSEUDONYM_KEY, email)
INSERT INTO students (pseudonym) VALUES (…) ON CONFLICT DO NOTHING
if aat_c === CONSENT_VERSION:
    UPDATE students SET consent_version, consent_at = now()
session = { sub: pseudonym, role: "student" }   // no email
```

The email is not returned, stored, or placed in the cookie. The student row is created on
first sign-in; all later data hangs off the pseudonym.

### Staff

```text
audit(staff_login)
session = { sub: "staff:<email>", role, email }
```

Staff emails are intentionally retained in the session and audit log so actions can be
attributed.

## Cookie reference

| Cookie | Name | Contents | Lifetime | Path | Flags |
|---|---|---|---|---|---|
| Session | `aat_s` | HS256 JWT: `sub`, `role`, optional `email` | 7 days | `/` | httpOnly, SameSite=Lax, Secure in prod |
| OIDC pending | `aat_o` | Signed provider/verifier/state/nonce | 10 min | `/api/auth/callback` | httpOnly, SameSite=Lax, Secure in prod |
| Consent carry | `aat_c` | Consent version string | 30 min | `/` | httpOnly, SameSite=Lax, Secure in prod |
| Locale | `aat_lang` | `en` or `hi` | 1 year | `/` | JS-readable, SameSite=Lax |

Cookie names are neutral. A browser cookie list should not reveal the app's purpose.

## Landing paths

| Role | Landing |
|---|---|
| `student` | `/checkin` |
| `counsellor` | `/counsellor` |
| `admin` | `/admin` |

`/signin` redirects an already-signed-in user to their landing path.

## Dev login

- Visible only when `devLoginEnabled()` is true: `DEV_LOGIN=true` **and** not production.
- POSTed as a form to `/api/auth/dev-login`.
- Checks same-origin, domain, then creates a normal session.
- Any allowed address becomes a student; `counsellor@…` and `admin@…` get staff roles from the
  allow-lists.
- In production the route returns `404 Not found` and env validation refuses to start with
  `DEV_LOGIN=true`.

Local defaults from `pnpm setup:env`:

```text
student1@nitp.ac.in     → student
counsellor@nitp.ac.in   → counsellor
admin@nitp.ac.in        → admin
```

## Error handling

| Error key | Cause | User sees |
|---|---|---|
| `wrong_domain` | Domain not allow-listed, or Google `hd` mismatch | "Use your institute account" |
| `unverified` | Google email not verified | Sign-in failed message |
| `wrong_tenant` | Microsoft account outside institute tenant | Sign-in failed message |
| `no_email` | No usable email claim | Sign-in failed message |
| `failed` | Provider rejection, network, state/nonce failure, unconfigured provider | Generic failure with retry |

Provider errors are logged with a message only (no tokens or codes).

## Sign-out and session expiry

- Sign-out is a POST to `/api/auth/logout` (same-origin) that deletes `aat_s` and redirects to
  `/`.
- Sessions are stateless; there is no server-side revocation. A copied token remains valid
  until expiry. Rotating `SESSION_SECRET` invalidates all sessions.
- Expired or invalid tokens are treated as unauthenticated: pages redirect to `/signin`, APIs
  return 401.

## Security properties

| Property | Status |
|---|---|
| Email never stored | ✅ for students |
| Role cannot be chosen by client | ✅ allow-list + signed token |
| CSRF on login? | Login is GET/redirect; dev login POST checks same-origin |
| Login CSRF / session fixation | PKCE + state + nonce; new session minted after callback |
| Token theft via XSS | httpOnly cookie; CSP limits script origins |
| Token theft via CSRF | SameSite=Lax; mutating routes check origin |
| Open redirect | Landing paths are constants, not user input |
| Tenant confusion | Microsoft issuer pinned to tenant; Google `hd` checked |
| Dev login in prod | Blocked at route and env validation |

## Related reading

- [Security architecture](../01-architecture/security-architecture.md)
- [Privacy and crypto](../03-domains/privacy-and-crypto.md)
- [API reference](../05-api/api-reference.md)
- [Configuration](../06-operations/configuration.md)
