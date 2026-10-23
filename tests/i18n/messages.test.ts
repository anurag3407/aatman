import { describe, expect, it } from "vitest";
import en from "@/messages/en";
import hi from "@/messages/hi";

/** The type system checks keys; this checks list lengths and that nothing was left in English by mistake. */
function walk(a: unknown, b: unknown, path: string, out: string[]) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) out.push(`${path}: length ${a.length} vs ${Array.isArray(b) ? b.length : "n/a"}`);
    else a.forEach((v, i) => walk(v, b[i], `${path}[${i}]`, out));
  } else if (a && typeof a === "object") {
    for (const k of Object.keys(a)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)?.[k], `${path}.${k}`, out);
  } else if (typeof a === "string") {
    if (typeof b !== "string" || !b.trim()) out.push(`${path}: missing`);
  }
}

describe("Hindi catalogue", () => {
  it("matches the English structure, including list lengths", () => {
    const problems: string[] = [];
    walk(en, hi, "", problems);
    expect(problems).toEqual([]);
  });

  it("has every questionnaire item", () => {
    expect(hi.checkin.phq9).toHaveLength(9);
    expect(hi.checkin.gad7).toHaveLength(7);
    expect(hi.checkin.likert).toHaveLength(4);
  });

  it("uses Devanagari for clinical content", () => {
    for (const s of [...hi.checkin.phq9, ...hi.checkin.gad7, ...Object.values(hi.checkin.cssrs), ...Object.values(hi.templates)]) {
      expect(s).toMatch(/[ऀ-ॿ]/);
    }
  });

  it("keeps placeholders intact", () => {
    expect(hi.checkin.progress).toContain("{done}");
    expect(hi.checkin.progress).toContain("{total}");
    expect(hi.history.retention).toContain("{months}");
  });
});
