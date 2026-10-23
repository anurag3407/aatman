import {
  GAD7_LENGTH,
  PHQ9_LENGTH,
  PHQ9_SAFETY_ITEM_INDEX,
  scoreCssrs,
  scoreGad2,
  scorePhq2,
  type Answer,
  type CssrsAnswers,
  type Likert4,
} from "@/lib/scales";
import type { CheckinAnswers } from "@/lib/safety/triage";

/**
 * Check-in sequence as a pure function of the answers so far. The UI stores answered
 * step ids in order. The next question is the first step in `sequence()` that isn't
 * answered yet, so changing an earlier answer re-routes everything after it.
 *
 * Order: PHQ-2 → GAD-2 → PHQ-9 item 9 (always) → C-SSRS if item 9 > 0 → campus items →
 * offer of the full scales if a 2-item screen is positive → optional free text.
 * A high-risk C-SSRS result ends the check-in at once, so support isn't delayed.
 */

export type CssrsStepId =
  | "cssrs.wish"
  | "cssrs.active"
  | "cssrs.method"
  | "cssrs.intent"
  | "cssrs.plan"
  | "cssrs.behaviorEver"
  | "cssrs.behaviorRecent";
export type CampusStepId =
  | "campus.sleep"
  | "campus.academics"
  | "campus.social"
  | "campus.substances"
  | "campus.safety";
export type StepId = `phq9.${number}` | `gad7.${number}` | CssrsStepId | CampusStepId | "deeper" | "freeText";

export type Step =
  | { id: `phq9.${number}`; kind: "likert4"; scale: "phq9"; index: number }
  | { id: `gad7.${number}`; kind: "likert4"; scale: "gad7"; index: number }
  | { id: CssrsStepId; kind: "yesno" }
  | { id: CampusStepId; kind: "campus" }
  | { id: "deeper"; kind: "deeper" }
  | { id: "freeText"; kind: "freeText" };

export type StepValue = number | boolean | string | null;

export interface FlowState {
  order: StepId[];
  values: Partial<Record<StepId, StepValue>>;
}

export type SafetyAnswer = "no" | "yes" | "prefer_not";

export interface CampusAnswers {
  /** 0 good … 3 very poor */
  sleep: Answer<Likert4>;
  /** 0 not at all … 3 a lot */
  academics: Answer<Likert4>;
  /** 0 yes easily … 3 no one / isolated */
  social?: Answer<Likert4>;
  /** 0 not at all … 3 nearly every day */
  substances?: Answer<Likert4>;
  safety: SafetyAnswer | null;
}

export const EMPTY_FLOW: FlowState = { order: [], values: {} };

const phq = (index: number): Step => ({ id: `phq9.${index}`, kind: "likert4", scale: "phq9", index });
const gad = (index: number): Step => ({ id: `gad7.${index}`, kind: "likert4", scale: "gad7", index });

function likert(v: StepValue | undefined): Answer<Likert4> {
  return v === 0 || v === 1 || v === 2 || v === 3 ? v : null;
}

function bool(v: StepValue | undefined): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function answered(state: FlowState, id: StepId): boolean {
  return Object.prototype.hasOwnProperty.call(state.values, id);
}

export function phq9Items(state: FlowState): Answer<Likert4>[] {
  return Array.from({ length: PHQ9_LENGTH }, (_, i) => likert(state.values[`phq9.${i}`]));
}

export function gad7Items(state: FlowState): Answer<Likert4>[] {
  return Array.from({ length: GAD7_LENGTH }, (_, i) => likert(state.values[`gad7.${i}`]));
}

export function cssrsAnswers(state: FlowState): CssrsAnswers {
  const ever = bool(state.values["cssrs.behaviorEver"]);
  const recent = bool(state.values["cssrs.behaviorRecent"]);
  const active = bool(state.values["cssrs.active"]);
  return {
    wishToBeDead: bool(state.values["cssrs.wish"]),
    activeThoughts: active,
    ...(active
      ? {
          method: bool(state.values["cssrs.method"]),
          intent: bool(state.values["cssrs.intent"]),
          planWithIntent: bool(state.values["cssrs.plan"]),
        }
      : {}),
    // Unknown timing stays null → "incomplete" → urgent, rather than guessing.
    behavior: ever === false ? "never" : ever === true ? (recent === null ? null : recent ? "within_3_months" : "over_3_months_ago") : null,
  };
}

export function safetyItemPositive(state: FlowState): boolean {
  const v = likert(state.values[`phq9.${PHQ9_SAFETY_ITEM_INDEX}`]);
  return v !== null && v > 0;
}

export function sequence(state: FlowState): Step[] {
  const steps: Step[] = [phq(0), phq(1), gad(0), gad(1), phq(PHQ9_SAFETY_ITEM_INDEX)];

  if (safetyItemPositive(state)) {
    steps.push({ id: "cssrs.wish", kind: "yesno" }, { id: "cssrs.active", kind: "yesno" });
    if (state.values["cssrs.active"] === true) {
      steps.push({ id: "cssrs.method", kind: "yesno" }, { id: "cssrs.intent", kind: "yesno" }, { id: "cssrs.plan", kind: "yesno" });
    }
    steps.push({ id: "cssrs.behaviorEver", kind: "yesno" });
    if (state.values["cssrs.behaviorEver"] === true) steps.push({ id: "cssrs.behaviorRecent", kind: "yesno" });

    const cssrsDone = steps.every((s) => answered(state, s.id));
    if (cssrsDone && scoreCssrs(cssrsAnswers(state)) === "high") return steps;
  }

  steps.push(
    { id: "campus.sleep", kind: "campus" },
    { id: "campus.academics", kind: "campus" },
    { id: "campus.social", kind: "campus" },
    { id: "campus.substances", kind: "campus" },
    { id: "campus.safety", kind: "campus" },
  );

  const phq2Positive = scorePhq2(phq9Items(state)).band === "positive";
  const gad2Positive = scoreGad2(gad7Items(state)).band === "positive";
  if (phq2Positive || gad2Positive) {
    steps.push({ id: "deeper", kind: "deeper" });
    if (state.values.deeper === true) {
      if (phq2Positive) for (let i = 2; i < PHQ9_SAFETY_ITEM_INDEX; i++) steps.push(phq(i));
      if (gad2Positive) for (let i = 2; i < GAD7_LENGTH; i++) steps.push(gad(i));
    }
  }

  steps.push({ id: "freeText", kind: "freeText" });
  return steps;
}

export function currentStep(state: FlowState): Step | null {
  return sequence(state).find((s) => !answered(state, s.id)) ?? null;
}

export function answer(state: FlowState, id: StepId, value: StepValue): FlowState {
  return {
    order: [...state.order.filter((x) => x !== id), id],
    values: { ...state.values, [id]: value },
  };
}

/** Undo the most recent answer that is still part of the sequence. */
export function back(state: FlowState): FlowState {
  const live = new Set(sequence(state).map((s) => s.id));
  const order = [...state.order];
  while (order.length) {
    const last = order.pop()!;
    if (live.has(last)) {
      const values = { ...state.values };
      delete values[last];
      return { order, values };
    }
  }
  return EMPTY_FLOW;
}

export function progress(state: FlowState): { done: number; total: number } {
  const steps = sequence(state);
  return { done: steps.filter((s) => answered(state, s.id)).length, total: steps.length };
}

export function isComplete(state: FlowState): boolean {
  return currentStep(state) === null;
}

/** Answers for triage. Steps no longer in the sequence (after re-routing) are ignored. */
export function toSubmission(state: FlowState): { answers: CheckinAnswers; campus: CampusAnswers } {
  const live = new Set(sequence(state).map((s) => s.id));
  const pruned: FlowState = {
    order: state.order.filter((id) => live.has(id)),
    values: Object.fromEntries(Object.entries(state.values).filter(([id]) => live.has(id as StepId))),
  };
  const freeText = pruned.values.freeText;
  const safety = pruned.values["campus.safety"];
  return {
    answers: {
      phq9: phq9Items(pruned),
      gad7: gad7Items(pruned),
      ...(safetyItemPositive(pruned) ? { cssrs: cssrsAnswers(pruned) } : {}),
      ...(typeof freeText === "string" && freeText.trim() ? { freeText: [freeText.trim()] } : {}),
    },
    campus: {
      sleep: likert(pruned.values["campus.sleep"]),
      academics: likert(pruned.values["campus.academics"]),
      social: likert(pruned.values["campus.social"]),
      substances: likert(pruned.values["campus.substances"]),
      safety: safety === "no" || safety === "yes" || safety === "prefer_not" ? safety : null,
    },
  };
}
