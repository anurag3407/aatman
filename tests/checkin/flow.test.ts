import { describe, expect, it } from "vitest";
import {
  answer,
  back,
  currentStep,
  EMPTY_FLOW,
  isComplete,
  progress,
  sequence,
  toSubmission,
  type FlowState,
  type StepId,
  type StepValue,
} from "@/lib/checkin/flow";
import { triage } from "@/lib/safety/triage";

/** Answer whatever the current step is with the next value from `script`, keyed by step id. */
function run(script: Partial<Record<StepId, StepValue>>, fallback: StepValue = 0): FlowState {
  let state = EMPTY_FLOW;
  for (let guard = 0; guard < 60; guard++) {
    const step = currentStep(state);
    if (!step) return state;
    const value = step.id in script ? script[step.id]! : step.kind === "freeText" ? null : step.kind === "yesno" || step.kind === "deeper" ? false : fallback;
    state = answer(state, step.id, value);
  }
  throw new Error("flow did not finish");
}

const ids = (s: FlowState) => sequence(s).map((x) => x.id);

describe("check-in sequence", () => {
  it("tier 1 is PHQ-2, GAD-2, item 9, campus, free text", () => {
    expect(ids(EMPTY_FLOW)).toEqual([
      "phq9.0",
      "phq9.1",
      "gad7.0",
      "gad7.1",
      "phq9.8",
      "campus.sleep",
      "campus.academics",
      "campus.social",
      "campus.substances",
      "campus.safety",
      "freeText",
    ]);
  });

  it("always asks the self-harm item, even with low PHQ-2 / GAD-2", () => {
    expect(ids(run({}))).toContain("phq9.8");
  });

  it("adds the C-SSRS screener only when item 9 > 0", () => {
    expect(ids(run({ "phq9.8": 0 }))).not.toContain("cssrs.wish");
    const s = run({ "phq9.8": 1 });
    expect(ids(s)).toEqual(expect.arrayContaining(["cssrs.wish", "cssrs.active", "cssrs.behaviorEver"]));
    expect(ids(s)).not.toContain("cssrs.method");
  });

  it("asks method/intent/plan only after active thoughts", () => {
    const s = run({ "phq9.8": 2, "cssrs.active": true });
    expect(ids(s)).toEqual(expect.arrayContaining(["cssrs.method", "cssrs.intent", "cssrs.plan"]));
  });

  it("asks timing only after past behaviour", () => {
    expect(ids(run({ "phq9.8": 1, "cssrs.behaviorEver": true }))).toContain("cssrs.behaviorRecent");
  });

  it("ends the check-in right after a high-risk C-SSRS answer", () => {
    const s = run({ "phq9.8": 3, "cssrs.active": true, "cssrs.intent": true });
    expect(isComplete(s)).toBe(true);
    expect(ids(s).at(-1)).toBe("cssrs.behaviorEver");
    expect(ids(s)).not.toContain("campus.sleep");
    expect(triage(toSubmission(s).answers).tier).toBe("crisis");
  });

  it("offers the deeper check only when a 2-item screen is positive", () => {
    expect(ids(run({}))).not.toContain("deeper");
    expect(ids(run({ "phq9.0": 2, "phq9.1": 1 }))).toContain("deeper");
  });

  it("deeper = yes adds the remaining items of the positive scale only", () => {
    const s = run({ "phq9.0": 2, "phq9.1": 2, deeper: true }, 1);
    const all = ids(s);
    for (let i = 2; i < 8; i++) expect(all).toContain(`phq9.${i}`);
    expect(all).not.toContain("gad7.2");
    const { answers } = toSubmission(s);
    expect(answers.phq9.every((v) => v !== null)).toBe(true);
    expect(triage(answers).scores.phq9.total).not.toBeNull();
  });

  it("progress counts answered steps of the live sequence", () => {
    const s = answer(answer(EMPTY_FLOW, "phq9.0", 1), "phq9.1", 1);
    expect(progress(s)).toEqual({ done: 2, total: 11 });
  });
});

describe("back and re-routing", () => {
  it("back removes the last answer", () => {
    const s = answer(answer(EMPTY_FLOW, "phq9.0", 1), "phq9.1", 2);
    expect(back(s).values).toEqual({ "phq9.0": 1 });
    expect(back(back(back(s)))).toEqual(EMPTY_FLOW);
  });

  it("changing item 9 back to 0 drops C-SSRS answers from the submission", () => {
    let s = run({ "phq9.8": 2, "cssrs.wish": true });
    s = answer(s, "phq9.8", 0);
    const { answers } = toSubmission(s);
    expect(answers.cssrs).toBeUndefined();
    expect(triage(answers).tier).toBe("mild");
  });
});

describe("toSubmission", () => {
  it("maps C-SSRS behaviour answers", () => {
    const never = toSubmission(run({ "phq9.8": 1 })).answers.cssrs;
    expect(never?.behavior).toBe("never");
    const recent = toSubmission(run({ "phq9.8": 1, "cssrs.behaviorEver": true, "cssrs.behaviorRecent": true })).answers.cssrs;
    expect(recent?.behavior).toBe("within_3_months");
    const old = toSubmission(run({ "phq9.8": 1, "cssrs.behaviorEver": true, "cssrs.behaviorRecent": false })).answers.cssrs;
    expect(old?.behavior).toBe("over_3_months_ago");
    const unknown = toSubmission(run({ "phq9.8": 1, "cssrs.behaviorEver": true, "cssrs.behaviorRecent": null })).answers.cssrs;
    expect(unknown?.behavior).toBeNull();
  });

  it("includes trimmed free text and campus answers", () => {
    const { answers, campus } = toSubmission(run({ freeText: "  exam stress  ", "campus.sleep": 3, "campus.safety": "yes" }));
    expect(answers.freeText).toEqual(["exam stress"]);
    expect(campus).toEqual({ sleep: 3, academics: 0, social: 0, substances: 0, safety: "yes" });
  });

  it("free-text crisis language escalates the tier", () => {
    const { answers } = toSubmission(run({ freeText: "I want to end my life" }));
    expect(triage(answers).tier).toBe("crisis");
  });
});
