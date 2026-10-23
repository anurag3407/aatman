# Scales and scoring

## Scope

Pure scoring functions for the instruments used by the check-in. No network, no database, no
React. All functions are deterministic and unit-tested against published cutoffs.

Source: `src/lib/scales/` (`phq.ts`, `gad.ts`, `who5.ts`, `cssrs.ts`, `types.ts`).

## Common types

```ts
type Likert4 = 0 | 1 | 2 | 3;          // PHQ/GAD
type Likert6 = 0 | 1 | 2 | 3 | 4 | 5;  // WHO-5
type Answer<T> = T | null;             // null = skipped / not asked

interface ScaleScore<Band extends string> {
  total: number | null;   // null when too few items answered
  band: Band | null;      // null when total is null
  answered: number;
  prorated: boolean;      // true when a total was estimated
}
```

`sumWithProrating(items, expectedLength, maxMissing)`:

1. Throws if `items.length !== expectedLength`.
2. Counts answered (`!== null`) and missing.
3. If zero answered or `missing > maxMissing` → `{ total: null, answered, prorated: false }`.
4. If no missing → exact sum.
5. Otherwise → `round(sum × expectedLength / answered)`, `prorated: true`.

Prorating follows common PHQ/GAD practice. It is intentionally conservative: at most one
missing item for full scales; zero for 2-item screens.

---

## PHQ-9

**Instrument:** Patient Health Questionnaire-9 (Kroenke, Spitzer & Williams, 2001). Free to
use. Nine items, each 0–3, recall "over the last 2 weeks".

**Constants**

```ts
PHQ9_LENGTH = 9
PHQ9_SAFETY_ITEM_INDEX = 8   // item 9
```

**Bands**

| Total | Band |
|---|---|
| 0–4 | `minimal` |
| 5–9 | `mild` |
| 10–14 | `moderate` |
| 15–19 | `moderately_severe` |
| 20–27 | `severe` |

**Scoring**

```ts
scorePhq9(items: Answer<Likert4>[]): ScaleScore<Phq9Band>
  sumWithProrating(items, 9, maxMissing = 1)
```

- 8 or 9 answered → total (prorated if 8).
- 7 or fewer answered → `total: null`, `band: null`.

**Item 9 handling**

Item 9 is part of the total like any other item, but safety interprets it separately. It is
always asked, even in a short check-in. Its value is read directly in
`safety/triage.ts` — not inferred from the total.

**Student display**

The internal band is never shown as a diagnosis. `src/messages/en.ts` maps it to neutral
wording (e.g. "a little", "quite a lot"), and the results page labels the scores as screening,
not diagnosis.

---

## PHQ-2

**Instrument:** first two items of PHQ-9 (Kroenke et al., 2003).

```ts
PHQ2_POSITIVE_CUTOFF = 3
scorePhq2(phq9Items) → total 0–6, band "negative" | "positive"
```

- Uses `phq9Items.slice(0, 2)`.
- **Never prorated**: `maxMissing = 0`. One missing item → `total: null`, `band: null`.
- Positive when total ≥ 3.
- A completed full PHQ-9 overrides the PHQ-2 for triage purposes; the PHQ-2 is still returned
  for display.

---

## GAD-7

**Instrument:** Generalized Anxiety Disorder-7 (Spitzer et al., 2006). Free to use. Seven
items, 0–3, last 2 weeks.

**Constants**

```ts
GAD7_LENGTH = 7
```

**Bands**

| Total | Band |
|---|---|
| 0–4 | `minimal` |
| 5–9 | `mild` |
| 10–14 | `moderate` |
| 15–21 | `severe` |

**Scoring**

```ts
scoreGad7(items) → sumWithProrating(items, 7, maxMissing = 1)
```

---

## GAD-2

```ts
GAD2_POSITIVE_CUTOFF = 3
scoreGad2(gad7Items) → total 0–6, "negative" | "positive"
```

- First two items of GAD-7.
- Never prorated.
- Positive at ≥ 3.

---

## WHO-5

**Instrument:** WHO-5 Well-Being Index. Five items, 0–5, "over the last two weeks". Higher is
better.

**Constants**

```ts
WHO5_LENGTH = 5
```

**Scoring**

```ts
scoreWho5(items) → total = raw × 4 (0–100), band
```

- Raw 0–25; percentage 0–100.
- One missing item may be prorated before conversion.
- `band`: `very_low` (≤ 28), `low` (≤ 50), `good` (> 50).

**Product status:** scored in code, **not asked in v1** to keep the check-in short. Triage
still handles it if provided (e.g. by a future flow or test). `very_low` raises the tier to
`moderate`.

---

## C-SSRS screener

**Instrument:** Columbia Suicide Severity Rating Scale, screener version (past month). Asked
only after PHQ-9 item 9 > 0. Free for this use; counsellor training recommended.

**Shape**

```ts
interface CssrsAnswers {
  wishToBeDead: boolean | null;       // Q1
  activeThoughts: boolean | null;     // Q2
  method?: boolean | null;            // Q3, only if active
  intent?: boolean | null;            // Q4, only if active
  planWithIntent?: boolean | null;    // Q5, only if active
  behavior: "never" | "over_3_months_ago" | "within_3_months" | null; // Q6 + timing
}
```

**Published triage levels**

| Risk | Criteria |
|---|---|
| `high` | `intent === true` OR `planWithIntent === true` OR `behavior === "within_3_months"` |
| `moderate` | `method === true` OR `behavior === "over_3_months_ago"` |
| `low` | `wishToBeDead` or `activeThoughts` true, without the above |
| `none` | All required answers present and negative |
| `incomplete` | A required answer is missing, so risk cannot be ruled out |

**Implementation order matters**

```ts
if (intent === true || planWithIntent === true || behavior === "within_3_months") return "high";
const followUpsMissing = activeThoughts === true &&
  (method == null || intent == null || planWithIntent == null);
if (wishToBeDead === null || activeThoughts === null ||
    behavior === null || followUpsMissing) return "incomplete";
if (method === true || behavior === "over_3_months_ago") return "moderate";
if (wishToBeDead || activeThoughts) return "low";
return "none";
```

A decisive "yes" on a high-risk item wins even when other answers are missing. This prevents
an incomplete form from masking intent.

**Aatman mapping** is deliberately more conservative than Columbia's labels:

| C-SSRS risk | Aatman tier |
|---|---|
| `high` | `crisis` |
| `moderate` | `urgent` |
| `incomplete` | `urgent` |
| `low` + `activeThoughts` | `urgent` |
| `low` (passive wish only) | `elevated` |
| `none` (but item 9 was positive) | `elevated` |

See [Safety triage](safety-triage.md) for the full precedence.

---

## Worked examples

### 1. Short check-in, low

```text
PHQ items 1,2 = 0,1 (PHQ-2 = 1, negative)
GAD items 1,2 = 1,1 (GAD-2 = 2, negative)
item 9 = 0
full scales not asked (screens negative)
→ phq9.total = null, gad7.total = null
→ tier mild
```

### 2. Positive PHQ-2, full scale completed

```text
PHQ-2 = 4 (positive) → deeper offered → items 3–9 answered
full PHQ-9 total = 12 → band moderate, tier moderate (phq9_moderate_plus)
PHQ-2 still reports 4/positive for display
```

### 3. Positive item 9, C-SSRS passive

```text
item 9 = 2
C-SSRS: wish = true, active = false, behavior = never
scoreCssrs → low (wish only)
triage: cssrsTier(low, {activeThoughts:false}) → elevated, reason cssrs_passive_wish
even if PHQ-9 total is 3 and GAD-7 is 2
```

### 4. Positive item 9, active thoughts, no method

```text
item 9 = 1
C-SSRS: wish = true, active = true, method = false, intent = false, plan = false, behavior = never
scoreCssrs → low
triage: activeThoughts → urgent, reason cssrs_active_thoughts
```

### 5. C-SSRS incomplete

```text
item 9 = 2
C-SSRS: wish = true, active = true, method = null, intent = null, plan = null, behavior = never
→ incomplete → urgent
```

### 6. Prorating

```text
PHQ-9: 8 answered, sum = 12 → total = round(12 × 9 / 8) = 14 → moderate
GAD-7: 6 answered → total null (maxMissing = 1)
```

---

## Validation and invariants

| Invariant | Enforced by |
|---|---|
| PHQ-9 array length is 9 | `sumWithProrating` throws; API schema |
| GAD-7 array length is 7 | same |
| WHO-5 length is 5 | `sumWithProrating` throws; triage validates |
| Likert values are 0–3 (0–5 for WHO-5) or null | Type system + zod |
| 2-item screens never prorate | `maxMissing = 0` |
| Full scales prorate at most one item | `maxMissing = 1` |
| A missing required C-SSRS item yields `incomplete` | `scoreCssrs` |
| High-risk "yes" is decisive | Order of checks |
| Scores never exceed maxima | Sum of bounded items |

## Test coverage

`tests/scales/scales.test.ts`:

- Every PHQ-9 band boundary (4/5, 9/10, 14/15, 19/20).
- Every GAD-7 boundary (4/5, 9/10, 14/15).
- WHO-5 percentage and boundaries (28/29, 50/51).
- Sum, proration, incomplete thresholds, wrong-length rejection.
- PHQ-2/GAD-2 positive at 3, never prorated.
- C-SSRS decision table.

`tests/safety/triage.test.ts` exercises the integration of these scores with tier rules.

## Clinical governance

Cutoffs are published constants, but their use in this population and the C-SSRS → tier
mapping require clinical lead sign-off. Changes here should be reviewed like clinical code,
not ordinary business logic. See [clinical-review.md](../clinical-review.md).

## Related reading

- [Safety triage](safety-triage.md)
- [Check-in and results flow](../02-flows/checkin-and-results.md)
- [clinical-review.md](../clinical-review.md)
