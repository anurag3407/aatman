# Frontend architecture

## Overview

The frontend is a Next.js 16 App Router application using React 19 server components by
default, with client components only where interactivity or browser storage is required.
There is **no `middleware.ts`**: all access control happens in server components, route
handlers, and server actions.

The UI is designed as a calm, low-stimulation mobile-first experience. It is not a dashboard;
most screens are single-column, one decision at a time.

## Route tree

```text
src/app/
├── layout.tsx                     root: fonts, metadata, viewport, SW registration
├── page.tsx                       public landing page
├── manifest.ts                    PWA manifest
├── globals.css                    Tailwind v4 import + design tokens
├── ServiceWorkerRegister.tsx      client: registers /sw.js in production
├── crisis/page.tsx                static, offline, bilingual helplines
├── (app)/                         student route group (shared shell)
│   ├── layout.tsx                 SiteHeader + footer + AppNav + I18nProvider
│   ├── checkin/page.tsx           check-in (supports ?mode=stateless)
│   ├── results/[id]/page.tsx      saved result
│   ├── results/local/page.tsx     offline/stateless result from sessionStorage
│   ├── history/page.tsx           chart + list + keep toggles
│   ├── book/page.tsx              slots + own bookings + contact form
│   ├── chat/page.tsx              reflective chat (only if LLM available)
│   ├── exercises/page.tsx         index
│   ├── exercises/breathing/page.tsx
│   ├── exercises/grounding/page.tsx
│   ├── exercises/sleep/page.tsx
│   ├── exercises/thought-record/page.tsx
│   ├── consent/page.tsx           age gate + consent
│   ├── signin/page.tsx            SSO buttons + dev login
│   ├── privacy/page.tsx           privacy notice copy
│   └── settings/page.tsx          export, erase, sign out
├── (staff)/                       staff route group (separate shell)
│   ├── layout.tsx                 staff header/nav, open-alert count
│   ├── actions.ts                 all staff server actions
│   ├── counsellor/page.tsx        requests + upcoming sessions
│   ├── counsellor/alerts/page.tsx
│   ├── counsellor/alerts/[id]/page.tsx
│   ├── counsellor/requests/[id]/page.tsx
│   ├── counsellor/bookings/[id]/page.tsx
│   ├── counsellor/slots/page.tsx
│   └── admin/page.tsx             aggregate dashboard
└── api/                           route handlers (see API reference)
```

Route groups `(app)` and `(staff)` do not appear in URLs. They exist to give each audience a
different shell without nesting the other's chrome.

## Rendering strategy

| Surface | Rendering | Reason |
|---|---|---|
| Landing `/` | Server-rendered per request | Locale from cookie/headers |
| Student pages | Dynamic server rendering | Session, consent, and decrypted data per request |
| Staff pages | Dynamic server rendering | Session and live queues |
| `/crisis` | Static markup, no data | Must render offline and instantly |
| Manifest/icons | Static | Baked into the image |
| API routes | Node runtime handlers | Crypto, DB, OIDC |

No page uses `revalidate` or cross-user caching. Personal data is never placed in a shared
cache. API responses carry `Cache-Control: no-store` via `next.config.ts`.

### Server/client split

```text
Server components                          Client components ("use client")
─────────────────────────────────────      ──────────────────────────────────────
(app)/layout.tsx                           AppNav, SiteHeader (links/toggle)
checkin/page.tsx (guards)                  CheckinFlow, StepView
results/[id]/page.tsx (loads record)       ResultsView, ContactForm, CrisisActions
history/page.tsx (loads list)              HistoryChart, KeepToggle
book/page.tsx (loads slots)                BookingView, ContactForm
chat/page.tsx (checks provider)            ChatView
settings/page.tsx                          EraseForm
staff pages (load queues)                  mostly server; forms post to server actions
exercises (static copy)                    Breathing, Grounding, ThoughtRecord
```

**Rule of thumb followed here:** the server decides *what* data exists and whether the user
may see it; the client handles interaction and transient state. No client component fetches
private data directly except through a same-origin API route.

## Layouts and shell

### Root layout (`src/app/layout.tsx`)

- Loads six Google fonts via `next/font`: Geist (sans), Geist Mono, Fraunces (display serif),
  Noto Sans Devanagari, Noto Serif Devanagari, Unbounded.
- Sets a deliberately neutral `<title>` and description ("A quiet space to check in with
  yourself"). A lock screen or tab title should not reveal the app's purpose.
- Sets light/dark theme colours.
- Mounts `<ServiceWorkerRegister />` after children.

### Student shell (`src/app/(app)/layout.tsx`)

- Resolves locale and messages once, wraps the tree in `I18nProvider`.
- Renders `SiteHeader`: logo, **Help now** (always visible), language toggle, settings (if
  signed in), quick exit.
- Renders footer: "not a diagnosis" statement and privacy/settings links.
- Renders `AppNav`, a fixed bottom tab bar:
  - signed in: Check-in, Exercises, Chat, Book, History
  - signed out: Check-in, Exercises, Sign in

### Staff shell (`src/app/(staff)/layout.tsx`)

- Calls `requireStaffPage()`; redirects unauthenticated users to `/signin` and students to
  `/`.
- Shows an alert count badge for counsellors (open + acknowledged).
- Navigation: counsellor sees Requests & sessions, Alerts, Slots, Dashboard; admin sees
  Dashboard only.
- Shows the staff email and a sign-out form.

### Staff action boundary

All staff mutations are Next.js **server actions** in `src/app/(staff)/actions.ts`, marked
`"use server"`. Each begins with `requireCounsellor()`, parses `FormData` with zod, calls a
service, then calls `revalidatePath` for affected routes. There is no client-side mutation
code for staff.

## State management

There is no global state library. State is deliberately local:

| State | Mechanism | Lifetime |
|---|---|---|
| Check-in progress | `FlowState` in React state, mirrored to `sessionStorage` under `aat_draft` | Tab session |
| Offline/stateless result | `sessionStorage` under `aat_result` | Tab session |
| Chat transcript | React state inside `ChatView` | Until navigation/refresh |
| Thought record | React state | Until navigation/refresh |
| Language | `aat_lang` cookie + `router.refresh()` | 1 year |
| Booking UI selection | Local component state | Until action completes |
| Server data | Rendered by server components | Per request |

`sessionStorage` writes are wrapped in `try/catch`: private mode or blocked storage degrades
to in-memory only.

## Check-in UI

`CheckinFlow` is a client component that treats `src/lib/checkin/flow.ts` as a pure state
machine:

- `currentStep(state)` returns the first unanswered step in the live sequence.
- Answering calls `answer(state, id, value)`; changing an earlier answer re-routes later
  questions automatically.
- `back(state)` removes the most recent answer that is still part of the live sequence.
- Progress is `answered / live steps`.
- The draft is restored after mount (not during render) to keep SSR and client HTML equal.
- The heading receives focus on each step change for screen-reader flow.
- Item 9 shows a sensitive-question intro; a positive answer shows an inline support banner
  immediately, before the C-SSRS.
- "Skip" is available on every step except free text; skipping item 9 contributes to an
  `elevated` tier by design.

Submission (`submit()`):

1. `toSubmission(state)` prunes answers no longer in the live sequence.
2. `stateless` → score locally and route to `/results/local`.
3. Otherwise `POST /api/checkins`.
   - `401` → `/signin`
   - `403` → `/consent`
   - non-OK → error banner
   - network `TypeError` → score locally, mark as offline, route to `/results/local`
4. On success, clear the draft and route to `/results/{id}`.

## Results UI

`ResultsView` is shared by saved, offline, and stateless modes. Layout is tier-dependent:

| Tier | First content | Then |
|---|---|---|
| `crisis` | `CrisisActions`: Tele-MANAS and 112 one-tap | Template summary, contact form, booking, no tips, no chat link |
| `urgent` | `CrisisActions` | Same pattern |
| `elevated` | Inline support banner | Summary, **contact form first**, booking, tips, exercises |
| `moderate` | Summary | Booking primary, contact form secondary, tips, chat |
| `mild` | Summary | Exercises primary, chat, tips, 14-day ICS reminder |

Details:

- The summary is fetched once from `POST /api/checkins/{id}/summary` if not already stored.
  Offline/stateless modes use the template immediately.
- An "AI note" caption appears only when `summary.source === "llm"`.
- The ragging card appears if the lexicon flagged ragging **or** the student answered
  `campus.safety === "yes"`.
- Score details are collapsed under a `<details>` element and labelled as non-diagnostic.
- The ICS link is `/api/reminder?days=14` with `download`.
- "New check-in" preserves stateless mode for stateless results.

## Chat UI

`ChatView`:

- Holds the transcript in component state; nothing is persisted.
- Runs `detectCrisis()` on the **client** before any network call. A hit pauses the chat and
  renders `CrisisActions` without contacting the API.
- Sends the full turn array to `POST /api/chat`; the server re-runs detection over all user
  turns.
- Handles response types: `reply`, `safety`, `ragging`, `unavailable`, `limit`.
- Disables the composer while paused or sending.
- Shows a persistent notice not to include names, phone numbers, or room numbers.

## Exercises

| Exercise | Component | State | Persistence |
|---|---|---|---|
| Box breathing | `Breathing.tsx` | Timer tick, running | None |
| 5-4-3-2-1 grounding | `Grounding.tsx` | Step index | None |
| Sleep basics | `sleep/page.tsx` | — | None |
| Thought record | `ThoughtRecord.tsx` | Seven fields | None; optional `.txt` download |

Animated elements respect `motion-reduce` where relevant. The exercises are cached by the
service worker after first visit so they work offline.

## Styling and design system

### Tokens (`src/app/globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f6f0e5` | `#151915` | Warm paper / deep moss |
| `--foreground` | `#2e342e` | `#ebe6da` | Ink |
| `--surface` | `#fffbf3` | `#1d231d` | Cards |
| `--accent` | `#4f6d58` | `#a9c5ad` | Primary actions |
| `--accent-soft` | `#e6eee2` | `#253229` | Quiet fills |
| `--urgent` | `#a34a3d` | `#e6a094` | Crisis actions only |
| `--glow` / `--lilac` / `--sky` | warm / muted violet / soft blue | adjusted | Ambient glows, charts |

- Fonts: `--font-sans` (Geist + Devanagari), `--font-serif` (Fraunces + Noto Serif
  Devanagari), `--font-mono`.
- `.app-shell::before` paints three low-opacity radial gradients; `::after` adds a subtle
  SVG noise layer. Both are `pointer-events: none` and behind content.
- Tailwind v4 is wired through `@theme inline`; components use semantic classes
  (`bg-surface`, `text-muted`, `border-border`) rather than raw hex values.
- `box-breath` keyframes implement 4 s in / 4 s hold / 4 s out / 4 s hold for the crisis page.

### Component primitives

`src/components/ui.tsx` provides `Page`, `PageTitle`, `Card`, `SectionLabel`, `Button`,
`LinkButton`, `Choice`, `Banner`, `BackLink`, and shared input/textarea classes.
`src/components/icons.tsx` provides inline SVGs (no icon dependency).
`src/components/Companion.tsx` provides the companion mark and note bubbles.

**Accessibility choices**

- One `h1` per page; step headings are focused on change.
- Choices are real buttons in a `role="group"`; progress uses `role="progressbar"` with
  `aria-valuenow`.
- Status messages use `aria-live="polite"`.
- Chart series differ by marker shape and dash pattern, not colour alone.
- Focus-visible outlines use the accent colour.
- Crisis numbers are `tel:` links with visible digits.

## PWA and offline

`src/app/manifest.ts` declares name, short name, neutral description, standalone display,
theme colours, and three icons.

`public/sw.js` (cache `aatman-v2`):

- **Install:** precache `/crisis` and the assets it references (`/_next/static/...` extracted
  from the HTML).
- **Activate:** delete older caches; claim clients.
- **Navigate:**
  - `/crisis` and `/exercises/*`: network-first, fall back to cache, then `/crisis`.
  - Any other page while offline: redirect to `/crisis`.
- **Static assets:** cache-first for `/_next/static/`.
- **Never cached:** API routes and personal pages (`results`, `history`, `chat`, `book`,
  `settings`).

`ServiceWorkerRegister.tsx` registers the worker. The Playwright `offline` project builds
production because the worker only registers there.

## Internationalisation in the UI

- `getMessages()` resolves locale server-side (cookie → `Accept-Language` → `en`).
- Only the locale string crosses the server/client boundary; both catalogs ship in the client
  bundle, so client components call `useI18n()` synchronously.
- Dates use `Intl` with `Asia/Kolkata`, so server and browser render the same text.
- The language toggle writes the cookie and calls `router.refresh()`; server components
  re-render in the new locale.
- The crisis page intentionally shows English and Hindi together, without a switch.

See [Internationalisation](../03-domains/i18n.md).

## Security-relevant frontend behaviour

- No `dangerouslySetInnerHTML` in application code.
- API calls are same-origin relative paths; no third-party scripts or fonts at runtime
  (fonts are self-hosted by `next/font`).
- CSP allows only `'self'` plus inline script/style required by Next's bootstrap. There is no
  `connect-src` to any third party.
- `Referrer-Policy: no-referrer` prevents leaking the app URL when a student follows an
  external link.
- Quick exit clears `sessionStorage` and uses `location.replace()` so Back does not return
  to the app.
- Erasure uses a full `location.assign("/")` after deletion so no client state from the
  erased account survives.

## Known frontend constraints

| Constraint | Effect |
|---|---|
| `unsafe-inline` in CSP for scripts | Required by Next's bootstrap without per-request nonces; documented trade-off |
| All catalogs in the client bundle | Simple synchronous i18n; bundle grows with languages |
| No push notifications | Calendar ICS is the reminder mechanism |
| Session cookie is SameSite=Lax | Mutations must be same-site; enforced additionally by origin checks |
| Exercise animations | Reduced-motion support is partial; check before adding motion |

## Related reading

- [System architecture](system-architecture.md)
- [Backend architecture](backend-architecture.md)
- [Check-in and results flow](../02-flows/checkin-and-results.md)
- [Offline and stateless](../02-flows/offline-and-stateless.md)
- [Internationalisation](../03-domains/i18n.md)
