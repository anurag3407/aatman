import Anthropic from "@anthropic-ai/sdk";
import type { LlmFailure, LlmProvider, LlmRequest, LlmResult } from "./provider";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  timeoutMs: number;
  /** Server-side refusal fallback: on a policy decline the API re-runs the request on a suitable model. */
  refusalFallback: boolean;
}

/**
 * Short, non-streaming replies. Effort is set to `low`: these are a few sentences of
 * plain writing. Thinking stays adaptive (it can't be disabled on this model);
 * `max_tokens` leaves headroom for it, and the prompt plus the output guard keep the
 * visible text short.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly opts: AnthropicOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: 1 });
    this.model = opts.model ?? DEFAULT_ANTHROPIC_MODEL;
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const params = {
      model: this.model,
      max_tokens: 4000,
      system: req.system,
      messages: req.messages,
      output_config: { effort: "low" as const },
    };

    try {
      const response = this.opts.refusalFallback
        ? await this.client.beta.messages.create({
            ...params,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          })
        : await this.client.messages.create(params);

      if (response.stop_reason === "refusal") return { ok: false, reason: "refusal" };
      if (response.stop_reason === "max_tokens") return { ok: false, reason: "truncated" };

      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
      return text ? { ok: true, text } : { ok: false, reason: "empty" };
    } catch (error) {
      return { ok: false, reason: classify(error) };
    }
  }
}

function classify(error: unknown): LlmFailure {
  // Log the type and status only. Request content is never logged.
  if (error instanceof Anthropic.RateLimitError) {
    console.warn("[llm] anthropic rate limited");
    return "rate_limited";
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    console.warn("[llm] anthropic timeout");
    return "timeout";
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`[llm] anthropic API error ${error.status ?? "?"} ${error.name}`);
    return "error";
  }
  console.error("[llm] anthropic unexpected error", error instanceof Error ? error.name : typeof error);
  return "error";
}
