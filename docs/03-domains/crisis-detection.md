# Crisis detection

## Purpose

A deterministic, multilingual text classifier that flags crisis language in optional free
text and chat. It runs **before** any text can reach an LLM and is identical on client and
server. It favours recall over precision: a false positive shows support resources; a false
negative can cost a life.

Source: `src/lib/safety/crisisDetector.ts`, lexicons in `src/lib/safety/lexicon/`.

## Output

```ts
type CrisisLevel = "none" | "passive" | "self_harm" | "acute";

interface CrisisDetection {
  level: CrisisLevel;      // highest level matched
  matchedIds: string[];    // lexicon entry ids, for tests and audit
  ragging: boolean;        // separate flag, does not raise level
}
```

The matched **text is never returned, stored, or logged**. Only entry ids are exposed, and
even those are stripped from the persisted triage.

## Level semantics

| Level | Meaning | Triage effect |
|---|---|---|
| `none` | No match | No change |
| `passive` | Passive death wish / hopelessness | Raise to `elevated` |
| `self_harm` | Self-harm intent or method without acute imminence | Raise to `urgent` |
| `acute` | Imminent intent, plan, or active danger | Raise to `crisis` |

Ranking: `none < passive < self_harm < acute`. When multiple texts match, the maximum wins.

## Normalisation

`normalizeForMatching(text)` makes one pattern cover many surface forms:

| Step | Effect |
|---|---|
| NFD normalise | Decompose diacritics |
| Remove zero-width chars (`\u200B-\u200D`, BOM) | Prevent Devanagari word splitting |
| Remove combining diacritics | Latin accents fold |
| Remove nukta (`़`) | ज़िंदगी → जिंदगी |
| Map chandrabindu (`ँ`) → anusvara (`ं`) | फाँसी → फांसी |
| NFC normalise | Recompose |
| Lowercase | Case-insensitive Latin |
| Drop apostrophes (`' ’ ‘ \``) | can't → cant, don’t → dont |
| Replace other punctuation/symbols with space | Token boundaries |
| Trim | — |

All lexicon patterns are tested against this normalised string. Patterns must therefore be
written in normalised form (lowercase, no apostrophes, Devanagari without nukta/chandrabindu).

## Lexicon structure

```ts
interface LexiconEntry {
  id: string;                 // stable, e.g. "en_acute_kill_self"
  category: "passive" | "self_harm" | "acute" | "ragging";
  pattern: RegExp;            // applied to normalised text
}
```

Current inventory:

| File | Entries | Acute | Self-harm | Passive | Ragging |
|---|---|---|---|---|---|
| `lexicon/en.ts` | 23 | 10 | 2 | 9 | 2 |
| `lexicon/hinglish.ts` | 22 | 11 | 2 | 8 | 1 |
| `lexicon/hi.ts` | 17 | 9 | 1 | 6 | 1 |
| **Total** | **62** | **30** | **5** | **23** | **4** |

The combined lexicon is flattened once at module load:

```ts
const LEXICON = [...EN_LEXICON, ...HINGLISH_LEXICON, ...HI_LEXICON];
```

### Ragging

Ragging entries set `ragging = true` but do **not** raise the crisis level. The product shows
the National Anti-Ragging Helpline and blocks the LLM for that check-in/chat turn. Ragging can
co-occur with crisis language; the crisis level is then raised by the other entries.

## Matching

```ts
for (const entry of LEXICON) {
  if (!entry.pattern.test(normalized)) continue;
  matchedIds.push(entry.id);
  if (entry.category === "ragging") ragging = true;
  else level = maxCrisisLevel(level, entry.category);
}
```

Notes:

- Patterns are not global (`/g`) or sticky, so `.test` is stateless across calls.
- The function scans the whole text once per entry; with ~62 entries this is cheap.
- It is synchronous and has no dependencies, so it runs in the browser and offline.

## Recall policy

- **CI fails below 100% recall** on the golden set (`tests/safety/golden.ts`).
- Precision is intentionally secondary. Extra support is acceptable; missed risk is not.
- The golden set currently contains representative phrasing in English, Hinglish, and
  Devanagari. The clinical lead is expected to expand it to 300+ phrases from real,
  anonymised student language before launch.
- Any new phrase that should match but does not is a test failure, not a tuning suggestion.

### What "recall" means here

For every golden phrase labelled with an expected minimum level, `detectCrisis(phrase).level`
must be at least that level. A phrase labelled `acute` cannot merely match `passive`.

## Known limitations

| Limitation | Consequence | Mitigation |
|---|---|---|
| Literal matching, not semantics | Paraphrase, metaphor, sarcasm may be missed | Golden set expansion; clinical review; text is optional |
| Negation is not modelled | "I would never kill myself" may match an acute pattern | Safe direction: overshoots support, not silence |
| Code-mixing | New transliterations/spellings may be missed | Add entries; normalise aggressively |
| Short text | "idk" or emoji-only carries no signal | Optional free text; item 9/C-SSRS remain primary |
| No NER | Names/places in text are not classified | Text is not stored; chat is scrubbed |
| No context | A quoted song lyric may match | False positive → support shown; acceptable |
| Language coverage | Only EN, Hinglish, HI | Other languages rely on structured items |
| Regex performance | Pathological patterns could backtrack | Keep patterns simple and anchored where possible |

**The lexicon is not the only safety net.** PHQ-9 item 9 and the C-SSRS are asked of every
relevant student regardless of text. The detector adds a path for students who write something
the structured questions did not capture.

## Where it runs

| Context | Called from | Why |
|---|---|---|
| Check-in triage | `triage()` → `detectCrisisInAll(freeText)` | Raise tier before scoring/storage |
| Chat client | `ChatView.send()` → `detectCrisis(message)` | Immediate pause without a network call |
| Chat server | `reflect()` → `detectCrisisInAll(all user turns)` | Prevent client bypass; catch historical disclosure |
| Output guard | `guardOutput()` → `detectCrisis(text)` | Block model output containing crisis/harm language |
| Ragging | Same functions | Divert to anti-ragging resources |

The same code path is used everywhere, so client and server cannot disagree.

## Privacy

- The text itself is passed in memory only.
- `matchedIds` are returned for tests; they are not stored with the check-in
  (`toPublicTriage` strips `textDetection`).
- Chat text is not logged. Provider errors log status only.
- Free-text check-in answers are discarded immediately after detection.
- Detection does not call an LLM or a network service.

## Adding or changing entries

1. Add an entry with a unique `id`, a `category`, and a `pattern` in normalised form.
2. Add at least one positive example to `tests/safety/golden.ts` with the expected level.
3. Add a negative example if the pattern is broad ("I could kill for a nap").
4. Run `pnpm test tests/safety`.
5. Have the clinical lead review the wording and category.
6. Update the counts and notes in this document.
7. Consider the operational impact: more `acute` entries create more crisis alerts.

### Pattern hygiene

- Prefer word boundaries (`\b`) for Latin phrases.
- Account for Hinglish spellings and common abbreviations.
- Do not use `.*` across long spans.
- Keep Devanagari patterns in normalised form (no nukta/chandrabindu).
- Avoid capturing groups unless needed; the detector only needs a match.

## Testing

`tests/safety/crisisDetector.test.ts`:

- Normalisation: case, apostrophes, punctuation; nukta; chandrabindu; zero-width joiners.
- 100% recall on the golden set.
- Ragging does not raise the level.
- `detectCrisisInAll` takes the highest level.
- Empty input → `none`.

`tests/safety/triage.test.ts`:

- Acute → crisis; self-harm → urgent; passive → elevated.
- Ragging blocks the LLM without raising the tier.

`tests/llm/llm.test.ts`:

- Chat pauses on crisis anywhere in the conversation.
- Output guard blocks crisis language in model output.

## Related reading

- [Safety triage](safety-triage.md)
- [Crisis flow](../02-flows/crisis.md)
- [LLM and guardrails](llm-and-guardrails.md)
- [clinical-review.md](../clinical-review.md)
