# Clinical review: what the clinical lead must sign off

Everything below is marked DRAFT in code. Changes after sign-off should go through the clinical lead too.

## 1. Instruments

| Instrument | Use | Source | Licence |
|---|---|---|---|
| PHQ-2 / PHQ-9 | Mood; item 9 = self-harm thoughts | Kroenke, Spitzer & Williams | Free to use |
| GAD-2 / GAD-7 | Anxiety | Spitzer et al. | Free to use |
| C-SSRS screener | Follow-up after item 9 > 0 | Columbia Lighthouse Project | Free for this use; counsellor training recommended |
| WHO-5 | Scored in code, **not asked in v1** (to keep the check-in short) | WHO | Free to use |

Item wording is in `src/messages/en.ts` (`checkin.phq9`, `checkin.gad7`, `checkin.cssrs`). **Hindi items in `src/messages/hi.ts` are a draft translation and must be replaced with the official validated Hindi versions.**

## 2. Flow decisions

- Tier 1 asks PHQ-2 + GAD-2 + **PHQ-9 item 9 for everyone** (PHQ-4 alone would never ask about self-harm).
- The full PHQ-9 / GAD-7 is *offered* when PHQ-2 ≥ 3 or GAD-2 ≥ 3 (on the subscale, not the PHQ-4 total).
- Item 9 > 0 → the C-SSRS screener follows immediately, with Tele-MANAS / 112 shown inline throughout.
- A high-risk C-SSRS answer ends the check-in at once and goes to crisis support.
- One skipped item is prorated for PHQ-9 / GAD-7; more makes the score "incomplete".

## 3. Tier rules (`src/lib/safety/triage.ts`)

| Tier | Triggers | What the student sees |
|---|---|---|
| **crisis** | C-SSRS intent, plan with intent, or behaviour in past 3 months; acute crisis language in free text | One-tap Tele-MANAS / 112 first, crisis template, contact-me form |
| **urgent** | C-SSRS method; past behaviour > 3 months; active thoughts without method; C-SSRS incomplete or skipped after item 9 > 0; self-harm language in free text | Same as crisis, with softer heading |
| **elevated** | Passive death wish only; item 9 > 0 with C-SSRS all "no"; item 9 skipped; passive-ideation language in free text | Inline helpline banner, template, contact-me form, booking |
| **moderate** | PHQ-9 ≥ 10, GAD-7 ≥ 10, or positive PHQ-2/GAD-2 without the full scale; WHO-5 ≤ 28 | Booking first; AI note allowed |
| **mild** | None of the above | Self-care, exercises, re-check reminder; AI note allowed |

**Decisions for the clinical lead to confirm:**
1. "Active thoughts without method" maps to **urgent**, which is more conservative than Columbia's "low".
2. A **skipped item 9** maps to **elevated** (gentle support shown, no alarm).
3. **Unknown timing** of past behaviour maps to **urgent**.
4. Symptom scores alone never go above **moderate**. Only safety signals do.

## 4. Crisis language detector (`src/lib/safety/lexicon/`)

- English, Hinglish (romanised) and Devanagari, normalised for spelling noise.
- Tuned for **recall**: hyperbole and negation ("I would never kill myself", "gonna die in this exam") still trigger. These are documented as accepted false positives in `tests/safety/golden.ts`.
- **Action:** expand the golden set to 300+ phrases with the counselling cell. CI blocks any change that misses one.

## 5. Copy to approve

- `results.heading.*`: heading per tier
- `templates.*`: the note shown for elevated/urgent/crisis, and whenever the AI is unavailable
- `results.tips.*`, `exercises.*` (sleep tips, grounding, thought record)
- `checkin.sensitiveIntro`, `checkin.cssrsIntro`, `checkin.inlineSupport`
- `chat.*` pause and fallback messages
- The `/crisis` page (`src/app/crisis/page.tsx`)

## 6. AI behaviour

- **Summary prompt** (`summarySystemPrompt`): scores and bands only, 3–4 sentences, never diagnose or mention medication or numbers. Used for mild/moderate only.
- **Reflective chat prompt** (`reflectSystemPrompt`): CBT-informed, one question per reply, no diagnosis or medical advice. Crisis messages never reach it.
- **Output guard** (`src/lib/llm/outputGuard.ts`): blocks diagnosis terms, medication and doses, links, any phone number except 14416 / 112 / 1-800-891-4416, and any self-harm or death language. On block, the student sees the template.
- **Red-team set** (`tests/llm/redteam.ts`): add every problematic output found during the pilot.
