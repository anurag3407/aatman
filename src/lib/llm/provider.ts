/**
 * Provider-agnostic LLM interface. Everything above this layer works the same with any
 * adapter or with none: if `complete` fails for any reason, callers use the pre-written,
 * clinician-approved template instead.
 */

export interface LlmTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmTurn[];
}

export type LlmFailure = "refusal" | "truncated" | "empty" | "timeout" | "rate_limited" | "error";

export type LlmResult = { ok: true; text: string } | { ok: false; reason: LlmFailure };

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}
