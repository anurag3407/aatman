# Offline and stateless modes

## Why this exists

Campus connectivity is unreliable: hostel Wi-Fi drops, captive portals intercept requests, and
a student may be in distress on a bus with no data. Two product modes protect the moments that
matter:

1. **Offline capability** — the crisis page and exercises must work without a network; a
   check-in completed offline should still produce results.
2. **Stateless mode** — an under-18 student (or anyone who does not want persistence) can use
   the check-in with nothing leaving the device.

These are separate mechanisms that share local scoring and `sessionStorage`.

## Offline architecture

```text
Service worker (public/sw.js)
  cache: aatman-v2
  install:
    fetch /crisis (cache: reload)
    cache HTML + referenced /_next/static/* assets
  activate:
    delete other caches
    clients.claim()
  fetch:
    GET only, same origin
    navigate:
      /crisis, /exercises/* → network-first → cache → /crisis
      anything else         → network, on failure redirect /crisis
    /_next/static/*         → cache-first, then network and cache
    API requests            → untouched (browser handles failure)
```

### What is cached

| Resource | Strategy | Reason |
|---|---|---|
| `/crisis` HTML + its CSS/JS/assets | Precache at install | The one page that must always render |
| Visited `/exercises/*` pages | Network-first, cache fallback | Calming tools remain available |
| `/_next/static/*` | Cache-first | Immutable hashed assets |
| API responses | Never | Personal data and freshness |
| `/results`, `/history`, `/book`, `/chat`, `/settings` | Never | Personal pages; stale data is worse than the crisis redirect |

### Navigation fallback

If any non-cached page fails to load offline, the worker redirects to `/crisis`. A student who
taps "History" on a dead network lands on helplines, not a browser error.

### Cache versioning

Bump `CACHE` (currently `aatman-v2`) when changing worker behaviour. Activation deletes older
caches. `/sw.js` is served with `no-cache, no-store, must-revalidate` so updates are picked up.

### Registration

`ServiceWorkerRegister.tsx` registers the worker. It is effectively a production concern; the
Playwright offline project runs a production build because the worker does not register in
the same way in dev.

### Limits and risks

- Cached exercise pages remain in Cache Storage until the cache is cleared or a new version
  activates. On a shared device this reveals that the person used the app, though not their
  answers.
- Quick exit clears `sessionStorage` but **not** Cache Storage. It leaves the site immediately;
  it does not scrub the service-worker cache.
- A student can clear site data in browser settings to remove both.
- The crisis page has no data dependencies, so it cannot show a stale personalised result.

## Offline check-in

`CheckinFlow.submit()` distinguishes failure types:

```ts
try {
  const res = await fetch("/api/checkins", …);
  …
} catch (err) {
  if (err instanceof TypeError) return finishLocally("offline");
  setError(m.common.genericError);
}
```

- A network-level failure (`TypeError`) → `finishLocally("offline")`.
- An HTTP error → banner with retry; answers retained.
- `finishLocally`:
  1. runs `triage()` in the browser,
  2. strips `textDetection` from the saved triage,
  3. writes `{ triage, campus, createdAt, reason }` to `sessionStorage` under `aat_result`,
  4. clears `aat_draft`,
  5. routes to `/results/local`.

`/results/local` reads `sessionStorage` **after mount** (SSR-safe), then renders `ResultsView`
with `mode="offline"`, a template summary, and a "not saved" banner.

### What offline results can and cannot do

| Capability | Offline |
|---|---|
| Score answers | ✅ same `triage()` code |
| Show tier-appropriate support | ✅ |
| Show one-tap helplines | ✅ |
| Show template summary | ✅ |
| Generate an LLM summary | ❌ no network; template used |
| Save to history | ❌ |
| Send a contact request | ❌ (server required) |
| Book a session | ❌ (server required) |
| Notify on-call staff | ❌ (no alert is created) |

The "not saved" banner is important: an offline crisis check-in does **not** create an alert.
The student still sees helplines. Staff are not notified. This limitation must be understood
by the counselling cell.

## Stateless (under-18) mode

Entry points:

- consent age gate → "under 18"
- `/signin` link "Under 18? Use Aatman without an account"
- `/checkin?mode=stateless`

Behaviour:

| Aspect | Stateless mode |
|---|---|
| Sign-in required | No |
| Consent recorded server-side | No |
| API calls for check-in | None |
| Draft storage | `sessionStorage` |
| Result storage | `sessionStorage` |
| Result URL | `/results/local` |
| Summary | Template only |
| Contact form | Hidden; banner explains it needs an account |
| Booking | Not offered from the result |
| History | Not available |
| Alert creation | None |
| Data leaving device | None |

The check-in page shows a persistent badge: "Not saving. Results stay on this device."

### Rationale

DPDP requires verifiable parental consent to process a child's data. Rather than build a
guardian-verification flow, the product offers a fully local experience. This is conservative:
the student gets scoring, support, and helplines, but creates no record and triggers no alert.

## Local storage keys

| Key | Contents | Cleared by |
|---|---|---|
| `aat_draft` | `FlowState` (order + values) | Submit, restart, quick exit, tab close |
| `aat_result` | `{ triage, campus, createdAt, reason }` | Quick exit, erasure, tab close |

All access is wrapped in `try/catch`. Blocked storage degrades to in-memory state for the
session; `/results/local` may show empty and offer a new check-in.

## Quick exit

`quickExit()`:

1. `sessionStorage.clear()`
2. `window.location.replace("https://www.google.com/search?q=weather")`

Triggered by the header button or double Escape within one second.

- `replace` means Back does not return to the app.
- It does not clear cookies, sign out, erase server data, or clear Cache Storage.
- On a shared device, follow with sign-out and/or Erase.

## Message consistency

The UI must not overpromise offline capability:

- Offline result: "You were offline, so this check-in wasn't saved."
- Stateless result: "These results are only on this device and disappear when you close the
  tab."
- Global offline copy: "You're offline. Crisis numbers still work. Open Help now."
- Crisis page: "This app can't call anyone for you, and no one watches it in real time."

## Testing

Playwright `offline` project (production build):

1. Crisis page renders, styled, with no network.
2. Any page opened offline falls back to the crisis page.
3. Exercise pages visited once keep working offline.
4. Crisis page shows Hindi alongside English.

E2E `flows` project:

5. Under-18 mode never sends answers to the server.

## Related reading

- [Frontend architecture](../01-architecture/frontend-architecture.md#pwa-and-offline)
- [Crisis flow](crisis.md)
- [Privacy and crypto](../03-domains/privacy-and-crypto.md)
- [Check-in and results](checkin-and-results.md)
