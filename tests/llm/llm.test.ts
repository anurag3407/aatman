import { describe, expect, it } from "vitest";
import { reflect, summarize } from "@/lib/llm";
import { guardOutput } from "@/lib/llm/outputGuard";
import en from "@/messages/en";
import { triage } from "@/lib/safety/triage";
import { MUST_ALLOW, MUST_BLOCK } from "./redteam";

const nulls = (n: number) => Array.from({ length: n }, () => null);
const campus = { sleep: 0, academics: 0, safety: "no" } as const;

describe("output guard red-team set", () => {
  it.each(MUST_BLOCK)("blocks: $why", ({ text }) => {
    expect(guardOutput(text, "chat").ok).toBe(false);
  });

  it.each(MUST_ALLOW)("allows: %s", (text) => {
    expect(guardOutput(text, "summary")).toEqual({ ok: true, text });
  });

  it("strips markdown instead of failing", () => {
    expect(guardOutput("**Thank you** for checking in.", "summary")).toEqual({ ok: true, text: "Thank you for checking in." });
  });
});

describe("summarize (mock provider)", () => {
  const moderate = triage({ phq9: [2, 2, 2, 2, 1, 1, 0, 0, 0], gad7: [0, 0, ...nulls(5)] });

  it("uses the LLM for mild/moderate tiers", async () => {
    expect(moderate.tier).toBe("moderate");
    const s = await summarize(moderate, campus, "en");
    expect(s.source).toBe("llm");
    expect(s.text).toMatch(/^Mock note/);
  });

  it.each(["elevated", "urgent", "crisis"] as const)("never uses the LLM for %s", async (tier) => {
    const t = { ...moderate, tier, llmAllowed: false };
    expect(await summarize(t, campus, "hi")).toEqual({ text: (await import("@/messages/hi")).default.templates[tier], source: "template" });
  });

  it("uses the template when the student reported feeling unsafe or ragged", async () => {
    expect((await summarize(moderate, { ...campus, safety: "yes" }, "en")).source).toBe("template");
  });
});

describe("reflect (mock provider)", () => {
  it("replies to ordinary messages", async () => {
    const out = await reflect([{ role: "user", content: "exams are stressing me out" }], "en");
    expect(out).toMatchObject({ type: "reply", source: "llm" });
  });

  it("pauses on crisis language anywhere in the conversation, before calling the model", async () => {
    const out = await reflect(
      [
        { role: "user", content: "I can't sleep" },
        { role: "assistant", content: "That sounds hard." },
        { role: "user", content: "honestly khud ko khatam kar lunga" },
      ],
      "en",
    );
    expect(out).toEqual({ type: "safety", level: "acute" });
  });

  it("routes ragging away from the model", async () => {
    expect(await reflect([{ role: "user", content: "seniors are ragging us" }], "en")).toEqual({ type: "ragging" });
  });

  it("replaces unsafe model output with the fallback", async () => {
    const out = await reflect([{ role: "user", content: "what should I do [mock:unsafe]" }], "en");
    expect(out).toEqual({ type: "reply", text: en.chat.fallback, source: "template" });
  });

  it("falls back on refusals and errors", async () => {
    for (const marker of ["[mock:refusal]", "[mock:error]"]) {
      expect(await reflect([{ role: "user", content: `hi ${marker}` }], "en")).toMatchObject({ source: "template" });
    }
  });
});
