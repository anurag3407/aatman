# Safety triage

## Purpose

`triage()` is the single authority that turns check-in answers into a support tier. It is a
pure, synchronous function with no network, no database, and no LLM. It runs in the browser
(for instant feedback and offline use) and again on the server (to produce the authoritative
stored result).

Source: `src/lib/safety/triage.ts`.

## Output contract

```ts
type Tier = "mild" | "moderate" | "elevated" | "urgent" | "crisis";
type TriageReason =
  | "cssrs_high" | "cssrs_moderate" | "cssrs_active_thoughts"
  | "cssrs_passive_wish" | "cssrs_incomplete" | "cssrs_pending"
  | "safety_item_positive" | "safety_item_skipped"
  | "text_acute" | "text_self_harm" | "text_passive"
  | "phq9_moderate_plus" | "gad7_moderate_plus"
  | "phq2_positive" | "gad2_positive" | "who5_very_low";

interface TriageResult {
  tier: Tier;
  reasons: TriageReason[];
  scores: { phq2, gad2, phq9, gad7, who5 | null, cssrs | null };
  cssrsRequired: boolean;
  offerFullPhq9: boolean;
  offerFullGad7: boolean;
  ragging: boolean;
  llmAllowed: boolean;
  textDetection: CrisisDetection;
}
```

The persisted form omits `textDetection` (`PublicTriage`), because matched lexicon ids could
hint at what the student wrote.

## Algorithm

```text
validate array lengths (9, 7, 5 if present)
tier = "mild"; reasons = []

1. Self-harm item (PHQ-9 index 8)
   item9 === null                 → raise elevated (safety_item_skipped)
   item9 > 0 and C-SSRS present   → score C-SSRS, map to tier (see below)
   item9 > 0 and C-SSRS absent    → cssrsRequired = true; raise urgent (cssrs_pending)

2. Free text (if any)
   detection.level === "acute"     → raise crisis  (text_acute)
   detection.level === "self_harm" → raise urgent  (text_self_harm)
   detection.level === "passive"   → raise elevated(text_passive)
   ragging is recorded separately, not raised

3. Symptom load
   if full PHQ-9 total exists:  total ≥ 10 → raise moderate (phq9_moderate_plus)
   else if PHQ-2 positive:                 → raise moderate (phq2_positive)
   if full GAD-7 total exists:  total ≥ 10 → raise moderate (gad7_moderate_plus)
   else if GAD-2 positive:                 → raise moderate (gad2_positive)
   if WHO-5 very_low:                      → raise moderate (who5_very_low)

4. Derived flags
   cssrsRequired = item9 > 0 && no cssrs answers
   offerFullPhq9 = PHQ-2 positive && full PHQ-9 not completed
   offerFullGad7 = GAD-2 positive && full GAD-7 not completed
   ragging       = text detection flag
   llmAllowed    = tier ≤ moderate && !ragging
```

`raise(t, reason)` sets `tier = max(tier, t)` and appends the reason. The tier only moves
upward; reasons accumulate, so staff can see every contributing factor.

## C-SSRS → tier mapping

```ts
function cssrsTier(risk, answers) {
  high       → crisis  (cssrs_high)
  moderate   → urgent  (cssrs_moderate)
  incomplete → urgent  (cssrs_incomplete)
  low        → answers.activeThoughts ? urgent (cssrs_active_thoughts)
                                      : elevated (cssrs_passive_wish)
  none       → elevated (safety_item_positive)
}
```

Why `none` is still `elevated`: item 9 was positive. Even if the screener is entirely
negative, support stays visible. A student who endorses self-harm thoughts and then denies
follow-up items should not fall to `mild`.

Why `low` + active thoughts is `urgent`: Columbia labels this "low", but active suicidal
thoughts in a student population warrant same-day human attention.

**DRAFT.** These thresholds and mappings require clinical lead approval before the pilot.

## Precedence and escalation matrix

| Condition | Minimum tier | Reason |
|---|---|---|
| Item 9 skipped | `elevated` | `safety_item_skipped` |
| Item 9 > 0, C-SSRS not answered | `urgent` | `cssrs_pending` |
| C-SSRS incomplete | `urgent` | `cssrs_incomplete` |
| C-SSRS high | `crisis` | `cssrs_high` |
| C-SSRS moderate | `urgent` | `cssrs_moderate` |
| C-SSRS low + active thoughts | `urgent` | `cssrs_active_thoughts` |
| C-SSRS low, passive only | `elevated` | `cssrs_passive_wish` |
| C-SSRS none (item 9 positive) | `elevated` | `safety_item_positive` |
| Free text acute | `crisis` | `text_acute` |
| Free text self-harm | `urgent` | `text_self_harm` |
| Free text passive | `elevated` | `text_passive` |
| PHQ-9 ≥ 10 | `moderate` | `phq9_moderate_plus` |
| PHQ-2 ≥ 3 (no full PHQ-9) | `moderate` | `phq2_positive` |
| GAD-7 ≥ 10 | `moderate` | `gad7_moderate_plus` |
| GAD-2 ≥ 3 (no full GAD-7) | `moderate` | `gad2_positive` |
| WHO-5 ≤ 28 | `moderate` | `who5_very_low` |
| Nothing raised | `mild` | — |

The maximum wins. A student with PHQ-9 = 20 and a passive death wish is `elevated`, not
`moderate`, because safety-related reasons outrank symptom load.

## Invariants

1. **Symptom scores alone never exceed `moderate`.** Only safety-item, C-SSRS, or free-text
   findings can raise a tier above moderate.
2. **A positive item 9 can never result in `mild` or `moderate`.** The minimum is `elevated`.
3. **A high-risk C-SSRS can never be downgraded by other answers.** It returns `crisis`
   immediately.
4. **A skipped item 9 can never be treated as negative.** Minimum `elevated`.
5. **Ragging does not raise the tier.** It disables the LLM and shows anti-ragging resources.
6. **The server always recomputes.** Client tiers are never trusted or stored.
7. **`textDetection` is not persisted.** Matched ids hint at content.
8. **`llmAllowed` is true only for `mild`/`moderate` without ragging.** Higher tiers get
   clinician-written text.

These invariants are covered by tests (see below) and should be treated as product safety
requirements, not implementation details.

## `llmAllowed`

```ts
tierRank(tier) <= tierRank("moderate") && !textDetection.ragging
```

In addition, `summarize()` separately refuses when `campus.safety === "yes"`:

```ts
if (!llm || !triage.llmAllowed || campus.safety === "yes") return template;
```

So even a `moderate` check-in with a "felt unsafe/ragged" answer gets a template. This is a
defence in depth: triage's ragging flag comes from free text, while `campus.safety` is an
explicit answer.

## `cssrsRequired`

True when item 9 > 0 and no C-SSRS answers were submitted. The UI uses it to show the screener
next; the temporary tier is `urgent`, not provisional `mild`. If a client submits without the
screener, the server stores `urgent` and creates an alert.

## `offerFullPhq9` / `offerFullGad7`

True when the 2-item screen is positive but the full scale was not completed. These drive the
"deeper" offer in the UI. They do not change the tier by themselves; the positive screen
already raises `moderate`.

## Examples

### Example A — Low scores, item 9 = 0

```text
PHQ-2 = 1, GAD-2 = 2, item 9 = 0, no full scales, no text
→ tier mild, reasons []
```

### Example B — High symptom load, no safety finding

```text
PHQ-9 = 18, GAD-7 = 15, item 9 = 0
→ moderate (phq9_moderate_plus, gad7_moderate_plus)
```

Not `elevated`: symptom load alone caps at moderate. The results page still offers counselling
and contact.

### Example C — Positive item 9, all C-SSRS no

```text
item 9 = 1
wish=false, active=false, behavior=never
→ elevated (safety_item_positive)
```

### Example D — Active thoughts

```text
item 9 = 2, active=true, method=false, intent=false, plan=false, behavior=never
→ urgent (cssrs_active_thoughts)
```

### Example E — Acute free text with low scores

```text
PHQ-2 = 0, GAD-2 = 0, item 9 = 0, free text "I want to kill myself tonight"
→ crisis (text_acute)
```

### Example F — Ragging only

```text
PHQ-2 = 1, item 9 = 0, free text "seniors are ragging me in the hostel"
→ tier mild (unchanged), ragging=true, llmAllowed=false
→ results show anti-ragging card
```

### Example G — Skipped item 9

```text
PHQ-2 = 0, GAD-2 = 0, item 9 = null
→ elevated (safety_item_skipped)
```

## Failure modes

| Input | Result |
|---|---|
| PHQ-9 length ≠ 9 | throws; API schema rejects first |
| GAD-7 length ≠ 7 | throws; API schema rejects first |
| WHO-5 length ≠ 5 | throws |
| Non-Likert values | type error / zod rejection |
| `cssrs` present with item 9 = 0 | ignored for tier (item 9 path not entered), still scored in `scores` if provided? No — `cssrs` is only scored inside the item9 > 0 branch; the output `cssrs` is `null` otherwise |
| Free text > 4000 chars | API rejects; flow truncates input via `maxLength` |
| Multiple text entries | `detectCrisisInAll` takes the max; API allows at most 1 |

## Testing

`tests/safety/triage.test.ts` covers:

- Tier-1 check-in with low scores.
- Positive PHQ-2/GAD-2 → moderate + full-scale offer.
- Skipped safety item → elevated.
- Every item-9 value routing.
- Positive item 9 never below elevated, regardless of other scores.
- Full PHQ-9 below 10 overriding a positive PHQ-2.
- PHQ-9 ≥ 10, GAD-7 ≥ 10, WHO-5 very low → moderate.
- Symptom scores never exceed moderate.
- Acute/self-harm/passive text escalation.
- Ragging blocks LLM without raising tier.
- Wrong-length arrays rejected.

## Changing triage safely

1. Change code and tests together.
2. Update this document and the reason-code labels (`src/lib/staffLabels.ts`).
3. Update [clinical-review.md](../clinical-review.md) and obtain sign-off.
4. Update user-facing copy if the student experience changes.
5. Run `pnpm check`; the safety tests are not optional.
6. Consider alert volume and staffing impact before widening crisis definitions.

## Related reading

- [Scales and scoring](scales-and-scoring.md)
- [Crisis detection](crisis-detection.md)
- [Alerts and escalation](alerts-and-escalation.md)
- [clinical-review.md](../clinical-review.md)
