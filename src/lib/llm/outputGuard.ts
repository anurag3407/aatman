import { detectCrisis } from "@/lib/safety/crisisDetector";

/**
 * Checks model output before a student sees it. Any failure means the caller shows
 * pre-written text instead: blocking a good reply costs little, showing a harmful one costs a lot.
 */

export type GuardFailure =
  | "empty"
  | "too_long"
  | "diagnosis"
  | "medication"
  | "harm_language"
  | "unknown_phone"
  | "link";

export type GuardResult = { ok: true; text: string } | { ok: false; reason: GuardFailure };

const MAX_CHARS = { summary: 900, chat: 1200 } as const;

/** The only numbers the model may write. Anything else could be a made-up helpline. */
const ALLOWED_NUMBERS = new Set(["14416", "112", "18008914416"]);

const DIAGNOSIS = [
  /\byou\s+(have|suffer\s+from|are\s+suffering\s+from|might\s+have|may\s+have|probably\s+have|likely\s+have)\s+(an?\s+)?(depression|anxiety|disorder|illness|condition|bipolar|ptsd|ocd|adhd)/i,
  /\bdiagnos/i,
  /\bdisorder\b/i,
  /\b(clinical|major)\s+depress/i,
  /\b(bipolar|schizo\w*|psychosis|psychotic|ptsd|ocd|adhd|borderline\s+personality)\b/i,
  /अवसाद|डिप्रेशन|विकार|बीमारी\s+है/u,
];

const MEDICATION = [
  /\b(ssris?|snris?|anti-?depressants?|benzodiazepines?|anxiolytics?|sedatives?|sleeping\s+pills?)\b/i,
  /\b(sertraline|fluoxetine|escitalopram|citalopram|paroxetine|venlafaxine|duloxetine|bupropion|mirtazapine|alprazolam|xanax|clonazepam|lorazepam|diazepam|zolpidem|melatonin|lithium|quetiapine|olanzapine|ashwagandha)\b/i,
  /\b\d+\s?mg\b/i,
  /\b(dosage|dose|prescription|prescribe\w*|medication|medicines?|tablets?|pills?)\b/i,
  /दवा|दवाई|गोली/u,
];

const HARM_TO_READER = /\b(kill|hurt|harm|cut)\s+yourself\b|\bbetter\s+off\s+(dead|without\s+you)\b|\bkhud\s+ko\s+maar\s+(do|lo)\b/i;

export function guardOutput(raw: string, kind: "summary" | "chat"): GuardResult {
  // Strip markdown the prompt asked the model not to use.
  const text = raw.replace(/\*\*|__|^#+\s*/gm, "").replace(/\n{3,}/g, "\n\n").trim();

  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MAX_CHARS[kind]) return { ok: false, reason: "too_long" };
  if (/https?:\/\/|www\.|\b[\w-]+\.(com|in|org|net)\b/i.test(text)) return { ok: false, reason: "link" };

  for (const run of text.match(/\+?\d[\d\s-]{1,14}\d/g) ?? []) {
    const digits = run.replace(/\D/g, "");
    // 5+ digits: short numbers ("2 weeks", "0–100") are fine; phone-like ones must be on the list.
    if (digits.length >= 5 && !ALLOWED_NUMBERS.has(digits)) return { ok: false, reason: "unknown_phone" };
  }

  if (DIAGNOSIS.some((r) => r.test(text))) return { ok: false, reason: "diagnosis" };
  if (MEDICATION.some((r) => r.test(text))) return { ok: false, reason: "medication" };

  // The model must never introduce self-harm or death language, or aim it at the reader.
  // Safety messaging that names helplines is handled by the app, not the model.
  if (HARM_TO_READER.test(text) || detectCrisis(text).level !== "none") return { ok: false, reason: "harm_language" };

  return { ok: true, text };
}
