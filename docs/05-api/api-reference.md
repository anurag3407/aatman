# API reference

All HTTP endpoints and staff server actions.

## Conventions

| Convention | Rule |
|---|---|
| Base URL | Same origin as the app (`APP_URL`) |
| Content type | Mutating JSON routes require `Content-Type: application/json` → otherwise 415 |
| CSRF | Mutating cookie routes require `Sec-Fetch-Site: same-origin` (or `Origin === APP_URL`) → otherwise 403 `bad_origin`. Cron routes use Bearer auth instead. |
| Auth | Signed `aat_s` cookie (HS256 JWT) |
| Consent | Routes marked “consent” return 403 `consent_required` for a stale student consent |
| IDs | UUIDs are validated; invalid → 404 |
| Errors | `{ "error": "<code>" }` unless noted |
| Rate limits | Return 429 with `{ "error": "rate_limited" }` (chat uses `{ "type": "limit" }`) |
| Caching | `/api/*` responses are `Cache-Control: no-store` |
| Route params | Next.js 16 async params (`params: Promise<{…}>`) |

### Status code map

| Status | Codes |
|---|---|
| 200 | Success |
| 201 | Created (`checkins`, `contact-requests`) |
| 303 | Redirect after form POST |
| 400 | `invalid_json`, `invalid_body`, `not_found` (some routes) |
| 401 | `unauthenticated`, cron `unauthorized` |
| 403 | `forbidden`, `consent_required`, `bad_origin`, `not_eligible` |
| 404 | `not_found` |
| 409 | `taken`, `too_many`, `no_checkin` |
| 415 | `expected_json` |
| 429 | `rate_limited` / chat `limit` |
| 503 | Health failure |

---

## Health

### `GET /api/health`

No auth. Runs `SELECT 1`.

```json
200 { "ok": true }
503 { "ok": false }
```

Used by Docker/Caddy health checks and Render. A failing database removes the replica from
rotation.

---

## Authentication

### `GET /api/auth/login/{provider}`

`provider` = `google` | `microsoft`.

- Starts OIDC authorization code + PKCE.
- Sets `aat_o` (signed pending state, 10 min, path `/api/auth/callback`).
- Redirects (302) to the IdP.
- Invalid provider or configuration error → 303 `/signin?error=failed`.

No body. Must be a top-level navigation (plain link).

### `GET /api/auth/callback/{provider}?code=…&state=…`

- Verifies `aat_o` and that the provider matches.
- Exchanges the code with PKCE/state/nonce.
- Evaluates identity claims (domain, tenant, verification).
- Creates the session and sets `aat_s`.
- Deletes `aat_o` and `aat_c`.
- Redirects (303) to the role landing page.

Failure → 303 `/signin?error={reason}` where reason ∈ `wrong_domain`, `unverified`,
`wrong_tenant`, `no_email`, `failed`.

### `POST /api/auth/dev-login`

Development/e2e only.

- Returns `404 Not found` unless `DEV_LOGIN=true` and `NODE_ENV !== "production"`.
- Requires same-origin.
- Body: `application/x-www-form-urlencoded` with `email`.
- Email must end with an allowed domain.
- Creates a session and redirects (303) to the role landing.

```bash
curl -i -X POST http://localhost:3000/api/auth/dev-login \
  -H 'Origin: http://localhost:3000' \
  --data-urlencode 'email=student1@nitp.ac.in'
```

### `POST /api/auth/logout`

- Same-origin.
- Deletes `aat_s`.
- 303 to `/`.

No body. No server-side revocation.

---

## Consent

### `POST /api/consent`

- Same-origin.
- No body required.

Behavior:

| Session | Effect | Response |
|---|---|---|
| Signed-in student | Records current consent | 303 `/checkin` |
| Not signed in / no session | Sets `aat_c` (30 min) with the current version | 303 `/signin` |
| Staff session | Treated as not signed in for consent | 303 `/signin` + cookie |

The OIDC callback reads `aat_c` and records consent against the new pseudonym.

---

## Student privacy

### `GET /api/me/export`

- Auth: `student`.
- Returns a JSON attachment `aatman-data.json`.

```json
{
  "exportedAt": "2026-10-24T…Z",
  "account": { "pseudonym": "p_…", "createdAt": "…", "consentVersion": "2026-10-v1", "consentAt": "…" },
  "checkins": [
    { "id": "…", "createdAt": "…", "tier": "mild", "answers": {}, "campus": {}, "scores": {}, "summary": "…", "keep": false }
  ],
  "contactRequests": [{ "id": "…", "createdAt": "…", "status": "closed", "contact": {} }],
  "bookings": [{ "id": "…", "startsAt": "…", "location": "…", "mode": "in_person", "status": "booked", "sharedCheckin": true }]
}
```

### `DELETE /api/me`

- Auth: `student`.
- Same-origin.
- Frees future bookings, clears booking ownership, deletes the student (cascade), audits
  `student_erased`, deletes the session cookie.

```json
200 { "ok": true }
```

Irreversible.

---

## Check-ins

### `POST /api/checkins`

- Auth: `student`, consent required.
- Same-origin.
- Rate limit: 10 per student per hour.
- Body:

```json
{
  "answers": {
    "phq9": [0,1,2,3,0,1,2,3,0],
    "gad7": [0,1,2,3,0,1,2],
    "cssrs": {
      "wishToBeDead": false,
      "activeThoughts": false,
      "behavior": "never"
    },
    "freeText": ["optional"]
  },
  "campus": {
    "sleep": 2,
    "academics": 2,
    "social": 1,
    "substances": 0,
    "safety": "no"
  },
  "locale": "en"
}
```

Validation (`checkinBody`):

- `phq9`: exactly 9, each `0|1|2|3|null`.
- `gad7`: exactly 7, same.
- `cssrs` optional: nullable booleans, `behavior` one of `never|over_3_months_ago|within_3_months|null`.
- `freeText`: at most 1 string, max 4000 chars.
- `campus`: all nullable Likert; `safety` one of `no|yes|prefer_not|null`.
- `locale`: `en|hi`.

The server **re-scores**; any client-supplied tier is ignored. Free text is scanned and
discarded.

```json
201 {
  "id": "uuid",
  "createdAt": "2026-10-24T…Z",
  "triage": {
    "tier": "moderate",
    "reasons": ["phq2_positive"],
    "scores": { "phq2": {}, "gad2": {}, "phq9": {}, "gad7": {}, "who5": null, "cssrs": null },
    "cssrsRequired": false,
    "offerFullPhq9": true,
    "offerFullGad7": false,
    "ragging": false,
    "llmAllowed": true
  }
}
```

Errors: 400 `invalid_body`, 401, 403 `consent_required`, 415, 429, 500.

### `POST /api/checkins/{id}/summary`

- Auth: `student`, consent.
- Same-origin.
- Rate limit: 20/hour.
- No body.
- Returns the cached summary if present; otherwise generates (guarded) and stores it.

```json
200 { "text": "…", "source": "llm" }
```

`source` ∈ `llm` | `template`. Errors: 404 `not_found`, 429.

### `POST /api/checkins/{id}/keep`

- Auth: `student` (consent not required).
- Same-origin.
- Body: `{ "keep": true }`.
- Owner-scoped.

```json
200 { "keep": true }
404 { "error": "not_found" }
```

---

## Contact requests

### `POST /api/contact-requests`

- Auth: `student`, consent.
- Same-origin.
- No rate limit; business cap 3 open requests.
- Body:

```json
{
  "checkinId": "uuid (optional; defaults to latest)",
  "name": "optional",
  "phone": "optional",
  "email": "optional",
  "bestTime": "optional",
  "consent": true
}
```

Validation: phone regex `/^[+\d][\d\s-]{6,18}$/` or empty; email valid or empty; at least one
of phone/email; `consent` must be literally `true`.

```json
201 { "id": "uuid" }
400 { "error": "no_checkin" }
429 { "error": "too_many" }
```

The tier is copied from the check-in. Open crisis alerts for the same pseudonym are linked to
this request.

---

## Chat

### `POST /api/chat`

- Auth: `student`, consent.
- Same-origin.
- Rate limit: 40/hour.
- Body:

```json
{
  "messages": [{ "role": "user", "content": "…" }],
  "locale": "en"
}
```

- 1–40 turns, each 1–2000 chars.
- The server re-checks all user turns for crisis/ragging.
- Nothing is stored.

Responses:

```json
200 { "type": "reply", "text": "…", "source": "llm" }
200 { "type": "reply", "text": "…", "source": "template" }
200 { "type": "safety", "level": "acute" }
200 { "type": "ragging" }
200 { "type": "unavailable" }
429 { "type": "limit" }
```

`level` ∈ `passive|self_harm|acute`.

---

## Booking

### `POST /api/slots/{id}/book`

- Auth: `student`, consent.
- Same-origin.
- Body:

```json
{ "share": true, "phone": "+91…", "remind": true }
```

- `phone` optional; `remind` optional.
- `share` requires an existing check-in.

```json
200 { "ok": true }
403 { "error": "not_eligible" }
409 { "error": "taken" | "too_many" | "no_checkin" }
404 { "error": "not_found" }   // invalid UUID
```

### `POST /api/slots/{id}/cancel`

- Auth: `student` (consent not required).
- Same-origin.
- No body.
- Only the owner's future booked slot.

```json
200 { "ok": true }
404 { "error": "not_found" }
```

### `POST /api/slots/{id}/reschedule`

- Auth: `student`, consent.
- Same-origin.
- Body: `{ "newSlotId": "uuid" }`.

```json
200 { "ok": true }
403 { "error": "not_eligible" }
404 { "error": "not_found" }
409 { "error": "taken" }
```

Both IDs must be valid UUIDs. The old slot is released only if the new one is secured.

---

## Scheduled jobs

Both require `Authorization: Bearer <CRON_SECRET>` and use a constant-time comparison.

### `POST /api/cron/alerts`

Runs:

1. alert escalation,
2. notification outbox delivery,
3. appointment SMS reminders.

```json
200 {
  "escalated": 1,
  "claimed": 4,
  "sent": 4,
  "failed": 0,
  "reminders": { "sent": 2, "failed": 0 }
}
401 { "error": "unauthorized" }
```

Intended schedule: every minute.

### `POST /api/cron/retention`

Runs retention with `RETENTION_MONTHS`.

```json
200 {
  "checkins": 12,
  "contactRequests": 3,
  "slots": 40,
  "auditLog": 0,
  "rateLimits": 8,
  "alerts": 2,
  "notifications": 15,
  "onCallShifts": 1
}
401 { "error": "unauthorized" }
```

Intended schedule: daily.

---

## Calendar reminder

### `GET /api/reminder?days={1..60}`

- No auth.
- Default `days=14`, clamped to 1–60.
- Returns a single-event ICS starting at 19:00 IST on the chosen day, 15 minutes long.
- Neutral event title `Check-in`; URL points to `/checkin`.

```
Content-Type: text/calendar; charset=utf-8
Content-Disposition: attachment; filename="check-in.ics"
```

The event contains no personal data.

---

## Staff server actions

Server actions are not JSON endpoints. They are invoked by form POSTs from staff pages and are
listed here for completeness.

All begin with `requireCounsellor()` → session role `counsellor` with an email.

| Action | Fields | Service | Audit | Revalidates |
|---|---|---|---|---|
| `setRequestStatus` | `id`, `status` (`new`/`contacted`/`closed`) | `updateContactRequestStatus` | `update_contact_request` | `/counsellor`, request detail |
| `createSlotsAction` | `start`, `duration` 15–120, `perDay` 1–12, `weeks` 1–12, `location`, `mode`, `isUrgent` | `createSlots` | `create_slots` | `/counsellor/slots` |
| `upsertProfileAction` | `displayName`, `languages`, `bio` | `upsertCounsellor` | `update_counsellor` | `/counsellor/slots`, `/book` |
| `markAttendanceAction` | `id`, `attended` (`yes`/`no`) | `markAttendance` | `mark_attendance` | `/counsellor`, booking detail |
| `cancelSlotAction` | `id` | `cancelSlotAsStaff` | `cancel_slot` | `/counsellor/slots` |
| `acknowledgeAlertAction` | `id` | `acknowledgeAlert` | `acknowledge_alert` | alerts list + detail |
| `resolveAlertAction` | `id`, `note?` | `resolveAlert` | `resolve_alert` | alerts list + detail |
| `createOnCallAction` | `staffEmail`, `role`, `start`, `end`, `backupEmail?` | `createOnCallShift` | `create_on_call` | `/counsellor/alerts` |

`datetime-local` values are interpreted as IST (`+05:30`). Invalid input throws before any
service call.

---

## Rate limits

| Route | Key | Limit | Window |
|---|---|---|---|
| `POST /api/checkins` | `checkin:<pseudonym>` | 10 | 1 h |
| `POST /api/checkins/{id}/summary` | `summary:<pseudonym>` | 20 | 1 h |
| `POST /api/chat` | `chat:<pseudonym>` | 40 | 1 h |
| Contact requests | cap, not rate limit | 3 open | — |
| Bookings | cap, not rate limit | 2 upcoming | — |

Counters are SHA-256 hashed in `rate_limits` and shared across replicas.

---

## Examples

### Submit a check-in (after sign-in)

```bash
curl -i -X POST http://localhost:3000/api/checkins \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -H 'Cookie: aat_s=<session>' \
  -d '{
    "answers": {
      "phq9": [0,1,0,1,0,0,0,0,0],
      "gad7": [0,1,0,1,0,0,0]
    },
    "campus": { "sleep": 1, "academics": 2, "safety": "no" },
    "locale": "en"
  }'
```

### Trigger cron

```bash
curl -X POST https://aatman.example.ac.in/api/cron/alerts \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Export

```bash
curl -OJ https://aatman.example.ac.in/api/me/export \
  -H 'Cookie: aat_s=<session>'
```

### Health

```bash
curl -fsS https://aatman.example.ac.in/api/health
```

---

## Error handling in clients

- Student mutations are called with relative `fetch` and JSON headers.
- The UI maps:
  - 401 → `/signin`
  - 403 with consent → `/consent`
  - 403 ineligible → localized "reserved" message
  - 409 → "taken" / too many
  - 429 → localized limit message
  - network `TypeError` → offline fallback (check-in) or error banner
- No server error body is rendered directly to the student.

## Related reading

- [Backend architecture](../01-architecture/backend-architecture.md)
- [Onboarding and authentication](../02-flows/onboarding-and-auth.md)
- [db.md](../04-data/db.md)
- [Configuration](../06-operations/configuration.md)
