import type { LlmProvider, LlmRequest, LlmResult } from "./provider";

/**
 * Deterministic provider for tests and local demos. Never allowed in production (see env.ts).
 * Markers in the last user message trigger failure modes, so the guards can be tested end to end:
 *   [mock:unsafe]  → a reply the output guard must block (diagnosis + medication)
 *   [mock:refusal] → a refusal
 *   [mock:error]   → a provider error
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";

  async complete(req: LlmRequest): Promise<LlmResult> {
    const last = req.messages.at(-1)?.content ?? "";
    if (last.includes("[mock:unsafe]")) {
      return { ok: true, text: "You have depression. Ask a doctor for sertraline 50 mg." };
    }
    if (last.includes("[mock:refusal]")) return { ok: false, reason: "refusal" };
    if (last.includes("[mock:error]")) return { ok: false, reason: "error" };

    if (req.system.includes("ROLE: SUMMARY")) {
      return {
        ok: true,
        text: "Mock note: thank you for checking in. Your answers suggest things have been heavy lately, and support is close by.",
      };
    }
    return { ok: true, text: "Mock reflection: that sounds like a lot to hold. What feels most important about it right now?" };
  }
}
