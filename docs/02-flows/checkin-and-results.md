# Check-in and results flow

## Purpose

This is the core student journey: a short branching questionnaire, deterministic scoring, a
saved or local result, and tier-appropriate next steps. The implementation is a pure state
machine (`src/lib/checkin/flow.ts`) rendered by `CheckinFlow` and scored by
`src/lib/safety/triage.ts`.

## Screen sequence

The live sequence is recomputed from the answers after every response. Changing an earlier
answer re-routes everything after it.

```text
1. PHQ-9 item 1        (PHQ-2)
2. PHQ-9 item 2
3. GAD-7 item 1        (GAD-2)
4. GAD-7 item 2
5. PHQ-9 item 9        ← ALWAYS asked
   │
   ├─ item 9 = 0 or skipped → continue
   └─ item 9 > 0 → C-SSRS:
        1. wish to be dead
        2. active thoughts
           ├─ no  → skip method/intent/plan
           └─ yes → method, intent, plan with intent
        3. behaviour ever
           └─ yes → behaviour in past 3 months?
        high-risk result → STOP (early exit)
6. Campus: sleep
7. Campus: academics
8. Campus: social support
9. Campus: substances
10. Campus: felt unsafe / ragged
11. If PHQ-2 ≥ 3 or GAD-2 ≥ 3: "deeper" offer
      └─ yes → remaining PHQ-9 items (2–8) and/or remaining GAD-7 items (2–6)
12. Free text (optional)
13. Submit
```

### Why this order

- PHQ-2 and GAD-2 are short and establish symptom load early.
- Item 9 is asked of everyone, including a "tier 1" check-in. PHQ-4 alone never asks about
  self-harm, which would be unsafe.
- The C-SSRS follows immediately after a positive item 9, with support visible inline.
- A high-risk C-SSRS (`intent`, `plan with intent`, or behaviour within 3 months) ends the
  check-in so support is not delayed by remaining questions.
- Campus questions add context for tips and counselling preparation.
- Full scales are offered, not forced, to keep the check-in short.
- Free text is last and optional.

## UI mechanics

| Element | Behaviour |
|---|---|
| Progress | `done / total` of the live sequence; animated bar with `role="progressbar"` |
| Back | Removes the most recent answer that is still part of the live sequence |
| Skip | Sets the step value to `null` (or `false` for the deeper offer); hidden on free text |
| Sensitive item | Item 9 shows an intro line before the question |
| Inline support | Once item 9 > 0, a support banner stays visible |
| Draft | Mirrored to `sessionStorage` under `aat_draft` after mount; restored on reload |
| Restart | Clears local state and storage |
| Focus | Step heading is focused on change |
| Copy | All questions and options come from `src/messages/{en,hi}.ts` |

Answer values:

- Likert: `0 | 1 | 2 | 3`
- Yes/no: `true | false`
- Campus safety: `"no" | "yes" | "prefer_not"`
- Free text: trimmed string or `null`

Skipped Likert items are stored as `null`; the arrays always have full length (9 and 7), which
keeps scoring functions total.

## Branching rules

### Positive item 9

`safetyItemPositive(state)` is true when item 9 is a number > 0. The sequence then adds:

- `cssrs.wish`
- `cssrs.active`
- if active: `cssrs.method`, `cssrs.intent`, `cssrs.plan`
- `cssrs.behaviorEver`
- if ever: `cssrs.behaviorRecent`

`cssrsAnswers()` maps to `CssrsAnswers`. If "behaviour ever" is `true` but timing is `null`,
the behaviour value is `null` → `incomplete` → `urgent`, rather than guessing.

### Early exit

After building the C-SSRS steps, the sequence checks:

```ts
const cssrsDone = steps.every((s) => answered(state, s.id));
if (cssrsDone && scoreCssrs(cssrsAnswers(state)) === "high") return steps;
```

Returning early means the campus questions, deeper offer, and free text are never shown. The
student goes straight to submit and crisis support.

### Deeper scales

`phq2Positive = PHQ-2 ≥ 3`, `gad2Positive = GAD-2 ≥ 3`.

- If either is positive, a `deeper` step is added.
- If the student says yes, the remaining items of **only the positive scale(s)** are added:
  PHQ-9 items 2–8 (index 2 through 7) and/or GAD-7 items 2–6.
- If the student says no, the full scales are not asked; triage still records the positive
  2-item screen.

### Bottom-out behavior

- Every non-free-text step can be skipped.
- If item 9 is skipped, the tier is `elevated` (`safety_item_skipped`) because risk cannot be
  ruled out.
- If the C-SSRS is required but incomplete, the tier is `urgent` (`cssrs_incomplete` or
  `cssrs_pending`).
- If every scale is skipped, the tier is at least `elevated` because item 9 is `null`.

## Submission

`toSubmission(state)`:

1. Builds the live step set from `sequence(state)`.
2. Prunes answers for steps no longer live (important after changing item 9 back to 0).
3. Maps PHQ-9 and GAD-7 arrays with `null` for unasked/skipped.
4. Includes `cssrs` only when item 9 is positive.
5. Includes trimmed free text only when non-empty.
6. Returns `{ answers, campus }`.

`CheckinFlow.submit()`:

```text
stateless?
  └─ yes → triage locally → sessionStorage aat_result → /results/local
  └─ no  → POST /api/checkins { answers, campus, locale }
            401 → /signin
            403 → /consent
            other non-OK → error banner
            TypeError (network) → local result, reason "offline" → /results/local
            OK → clear draft → /results/{id}
```

The client computes triage only for the local/offline path. The server recomputes it from the
answers and ignores any client-supplied tier.

## Server-side persistence

`createCheckin`:

1. `triage(input.answers)` → authoritative result.
2. `toPublicTriage()` removes `textDetection` (matched rule ids could hint at what was
   written).
3. Removes `freeText` from `answers`.
4. Seals `{ answers, campus, triage, locale }` with the owner's pseudonym as AAD.
5. In one transaction:
   - inserts the check-in (plaintext `tier`, encrypted `payload_enc`);
   - for `crisis`/`urgent`, inserts `crisis_alerts`;
   - queues outbox notifications to on-call staff or the fallback list.
6. Returns `{ id, createdAt, triage }`.

Free text is gone after step 3. It is used for detection before that, but never written.

## Results layout

`ResultsView` is shared by saved, offline, and stateless modes.

| Tier | Top of page | Summary | Actions |
|---|---|---|---|
| `crisis` | Crisis actions (14416, 112) | Clinician template | Contact form, booking, all helplines; no tips, no chat |
| `urgent` | Crisis actions | Clinician template | Contact form, booking |
| `elevated` | Support banner | Clinician template | **Contact form first**, booking, tips, exercises |
| `moderate` | Heading | LLM note or template | Booking primary, contact form secondary, tips, exercises, chat |
| `mild` | Heading | LLM note or template | Exercises primary, chat, tips, ICS |

Always present unless tier is `crisis`:

- Campus tips derived from answers ≥ 2 (sleep, academics, social, substances).
- 14-day calendar reminder link (`/api/reminder?days=14`).
- Collapsible score details, labelled as screening not diagnosis.

Ragging card appears when the lexicon flagged ragging or `campus.safety === "yes"`.

### Summary loading

- Saved result with a cached summary → render immediately.
- Saved result without one → `POST /api/checkins/{id}/summary`; show "Writing a short note…";
  on failure use the template.
- Offline/stateless → template immediately; no API call.

The "Written with AI from your scores only, then checked by our safety filters" caption
appears only for `source: "llm"`.

### Score display

| Shown | Condition | Max |
|---|---|---|
| PHQ-9 | Full total available | 27 |
| PHQ-2 | Full PHQ-9 unavailable | 6 |
| GAD-7 | Full total available | 21 |
| GAD-2 | Full GAD-7 unavailable | 6 |

Bands map to neutral student-facing words (`src/messages/en.ts` → `results.level`), never
diagnostic labels. Prorated totals are possible (one missing item); the staff view labels
them, the student view does not.

## History and keep

`/history` lists newest first and charts full-scale scores over time.

- Chart requires at least two usable points; missing totals create gaps.
- Mood series is PHQ-9 (0–27), worry is GAD-7 (0–21), both normalised to 0–100%.
- Series differ by marker shape and dash, not colour alone.
- `keep` toggles exemption from automatic retention. Kept rows show "Kept".
- History copy states the retention window (from `RETENTION_MONTHS`).

## Edge cases

| Case | Behaviour |
|---|---|
| Reload mid-check-in | Draft restored from `sessionStorage` after mount |
| Two tabs | Each tab has its own draft; last submit wins, both may save separate check-ins |
| Change item 9 from positive to 0 | C-SSRS answers remain in state but are pruned from submission and no longer part of the live sequence |
| Skip item 9 | Tier `elevated`; C-SSRS not shown |
| Positive item 9 + all C-SSRS "no" | Tier `elevated` (support stays visible) |
| High-risk C-SSRS | Check-in ends immediately |
| Free text with acute language | Tier `crisis` regardless of scores |
| Free text with ragging only | Tier unchanged; LLM disabled; anti-ragging card shown |
| Offline at submit | Local result, "not saved" banner |
| Storage blocked | Draft/results work in memory for the session; local results page may show empty |
| Consent outdated | Redirect to `/consent` before saving |
| Very slow server | Button disabled while submitting; no duplicate submit |

## Copy and clinical ownership

All question text, options, headings, templates, and crisis copy live in
`src/messages/en.ts` and `hi.ts`. Clinical content requires sign-off; the Hindi instruments
are currently a draft translation pending validated versions. See
[clinical-review.md](../clinical-review.md).

## Related reading

- [Scales and scoring](../03-domains/scales-and-scoring.md)
- [Safety triage](../03-domains/safety-triage.md)
- [Crisis flow](crisis.md)
- [Offline and stateless](offline-and-stateless.md)
- [LLM and guardrails](../03-domains/llm-and-guardrails.md)
