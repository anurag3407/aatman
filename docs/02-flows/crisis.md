# Crisis flow

## Principle

Crisis handling is layered so that no single failure leaves a student without a next step:

1. **Immediate, offline-capable helplines** on the results page and `/crisis`.
2. **Deterministic detection** that cannot be downgraded by a client or an LLM.
3. **A human alert** routed to on-call staff with an escalation ladder.
4. **Optional callback details** the student can share with one explicit action.
5. **Safe degradation** when staff, email, or the network are unavailable.

The app never claims to be a crisis service. The crisis page says plainly that it cannot call
anyone and that no one watches it in real time.

## What counts as crisis or urgent

Exact rules are in [Safety triage](../03-domains/safety-triage.md). Summary:

| Tier | Triggers |
|---|---|
| `crisis` | C-SSRS intent or plan with intent; suicidal behaviour within 3 months; free text at `acute` level |
| `urgent` | C-SSRS method; behaviour > 3 months ago; active thoughts without method; C-SSRS incomplete or pending; free text at `self_harm` level |

`elevated` (passive wish, positive item 9 with all-no C-SSRS, skipped item 9, passive text) does
**not** create an alert, but shows support and the contact form.

## Student-visible sequence

### During the check-in

- A positive item 9 immediately shows: "If you're in danger right now, call Tele-MANAS 14416
  (free, 24×7) or 112."
- The C-SSRS follows on the same screen flow.
- A high-risk answer ends the check-in immediately.

### On results

```text
crisis / urgent:
  ┌─────────────────────────────────────────────┐
  │ Please reach out now                        │
  │ [ Call Tele-MANAS 14416 ]  (primary)        │
  │ [ Call 112 ]               (urgent color)   │
  │ All helplines →                             │
  └─────────────────────────────────────────────┘
  Clinician-written summary (no LLM)
  Contact form (share callback details)
  Booking link
  No tips, no chat link
```

The summary for crisis/urgent/elevated is always a pre-written, clinician-approved template.
The LLM is never called for these tiers, for ragging, or when the student reported feeling
unsafe (`campus.safety === "yes"`).

### Crisis page (`/crisis`)

- Static, no data fetching, works offline.
- English and Hindi shown together; no language switch needed.
- Primary: Tele-MANAS 14416 with alternate 1-800-891-4416.
- Emergency: 112.
- Additional: configured campus contacts (only if phone numbers are configured) and iCall
  (Mon–Sat, 10:00–20:00).
- Anti-ragging helpline section.
- Box-breathing animation while waiting.
- Quick exit.
- Explicit limitation statement.

### Chat crisis pause

`ChatView` runs `detectCrisis()` on the device before sending. On a hit:

- The message is not sent to the API.
- The composer is replaced by a pause card and `CrisisActions`.
- The same happens if the server detects risk in any user turn (`type: "safety"`).

Ragging pauses with the anti-ragging helpline instead; it does not raise the crisis tier.

## Alert creation

Alerts are created inside the same transaction as the check-in:

```text
createCheckin()
  triage → tier
  if tier ∈ {crisis, urgent}:
      INSERT crisis_alerts (pseudonym, checkin_id, tier, status='open')
      recipients = getAlertRecipients()
      INSERT notification_outbox rows (one per recipient)
```

`getAlertRecipients()`:

1. Active on-call shifts where `starts_at <= now < ends_at`, counsellor role first.
2. If none, `ALERT_EMAILS`.

The notification contains only the tier and a link to
`/counsellor/alerts/{id}`. It states: "This message contains no student details."

### The alert is a pointer, not a record

`crisis_alerts` holds:

- pseudonym
- check-in id (nullable)
- contact request id (nullable)
- tier (`crisis`/`urgent`)
- status (`open`/`acknowledged`/`resolved`)
- timestamps and actor emails
- escalation level
- encrypted resolution note

It holds **no answers, scores, free text, or contact details**. Until the student sends a
contact request, a counsellor opening the alert learns severity and timing only.

## Escalation

```text
age ≥ threshold → raise level → queue one notification per step
```

| Tier | Level 1 | Level 2 | Level 3 |
|---|---|---|---|
| `crisis` | 10 min → backup counsellor | 20 min → clinical lead | 30 min → admin/fallback |
| `urgent` | 30 min → backup counsellor | 60 min → clinical lead | 120 min → admin/fallback |

Implementation details:

- Only `status='open'` and `acknowledged_at IS NULL` alerts escalate.
- `SELECT … FOR UPDATE SKIP LOCKED` prevents double-paging across replicas.
- The desired level is recomputed from age; if it is not greater than the stored level, no
  action.
- Recipients:
  - level 1: active shift `backup_email`, else `ALERT_EMAILS`;
  - level 2: `CLINICAL_LEAD_EMAILS`, else `ALERT_EMAILS`;
  - level 3: `ADMIN_EMAILS`, else `ALERT_EMAILS`.
- The level update is conditional on the previous level, making repeated runs idempotent.
- Acknowledgement stops escalation.

## Staff response

### Queue (`/counsellor/alerts`)

- Open + acknowledged alerts only.
- Crisis first, then oldest first.
- Each row shows tier, age, timestamp, acknowledgement, escalation badge, and "Callback
  shared" when linked.
- Warnings:
  - no recipients configured;
  - no active shift (fallback list shown);
  - production with no email transport ("nobody will be paged outside this dashboard").

### Detail (`/counsellor/alerts/{id}`)

- Tier, status, timing, escalation level, short reference id.
- "What to do now" guidance.
- If callback details were shared: link to the contact request.
- If not: explains the student has still been shown 14416 and 112.
- Acknowledge button.
- Resolve form with an optional encrypted note (max 2000 chars).

Opening the alert writes `view_alert`. Acknowledging writes `acknowledge_alert`. Resolving
writes `resolve_alert`.

### Callback

When the student sends a contact request, any open/acknowledged alert for that pseudonym with
no linked request is updated to point at it. The counsellor can then open the request, which
decrypts contact details and the shared check-in (audited).

## Outbox and delivery

- Email is delivered by an HTTP webhook (`NOTIFY_WEBHOOK_URL`), with optional bearer token.
- Retries: 1, 5, 15, 60 minutes; dead after 5 attempts.
- A `sending` row older than 10 minutes is reset to `pending`.
- Batch size 20 per cron run.
- Developer fallback logs only recipient + subject (email) or last four digits (SMS).
- Production without transport → rows fail, then dead. The dashboard warning is the only
  signal.

## Offline crisis behavior

| Situation | Behaviour |
|---|---|
| Student opens `/crisis` offline | Served from precache with CSS/JS |
| Student opens any other page offline | Service worker redirects to `/crisis` |
| Student completes check-in offline | Local triage, `/results/local`, crisis actions if tier warrants |
| Student taps a `tel:` link | Handled by the device; no network needed |
| LLM unavailable | Irrelevant to crisis; templates and helplines are deterministic |

The crisis page and helplines are bundled, so no API or database is required to render them.

## Quick exit

- Header button on every student page and on `/crisis`.
- Double Escape within one second.
- Clears `sessionStorage` and replaces the page with a neutral search URL.
- Does not sign out or erase server data. Settings → Erase is the data-deletion path.
- On a shared device, the student should also sign out.

## Helpline data

`src/lib/safety/helplines.ts`:

| Helpline | Number | Hours |
|---|---|---|
| Tele-MANAS | 14416; alt 1-800-891-4416 | 24×7, free |
| Emergency | 112 | 24×7 |
| iCall (TISS) | 9152987821 | Mon–Sat, 10:00–20:00 |
| National Anti-Ragging | 1800-180-5522 | 24×7 |

Campus contacts are placeholders with `tel: null` and are hidden until the counselling cell
fills them in, so a placeholder number never ships. Verify national numbers before each
release.

## Limitations to communicate

These are stated in product copy and must remain true:

- The app cannot place a call for the student.
- No human monitors the app in real time.
- An alert is best-effort and depends on staffed on-call coverage and working email.
- Helplines are external; availability and language support are the provider's.
- The app is not a diagnosis and not a substitute for emergency services.

## Failure matrix

| Failure | Student outcome | Staff outcome |
|---|---|---|
| No on-call shift | Unaffected | Alert goes to fallback list |
| No email transport | Unaffected | Outbox dead after retries; dashboard warning |
| Email webhook down | Unaffected | Retries with backoff |
| Database down | Local result if check-in; crisis page still works | No queue |
| App offline | `/crisis` from cache | — |
| Staff not responding | Unaffected | Escalation to backup → clinical lead → admin |
| Student does not share callback | Unaffected | Alert remains a pointer; student shown helplines |

## Drill checklist

The clinical lead and IT should run this before launch (see
[LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md)):

1. Complete a check-in that triggers `crisis`.
2. Confirm the alert appears and the email is PII-free.
3. Do not acknowledge; confirm escalation at 10/20/30 minutes.
4. Acknowledge; confirm escalation stops.
5. Send a contact request; confirm the alert links to it.
6. Open the request; confirm audit rows and decrypted details.
7. Resolve with a note; confirm the note is encrypted at rest.
8. Repeat with the network offline for the student path.

## Related reading

- [Safety triage](../03-domains/safety-triage.md)
- [Crisis detection](../03-domains/crisis-detection.md)
- [Alerts and escalation](../03-domains/alerts-and-escalation.md)
- [Crisis detector code](../../src/lib/safety/crisisDetector.ts)
- [clinical-review.md](../clinical-review.md)
