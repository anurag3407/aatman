import type { LlmProvider, LlmRequest, LlmResult } from "./provider";

export interface OpenAiCompatOptions {
  /** e.g. http://localhost:8000/v1 for vLLM, http://localhost:11434/v1 for Ollama. */
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
}

/**
 * Any server that speaks the `/chat/completions` protocol. Mainly for self-hosted open
 * models, so data stays on infrastructure the institute controls.
 */
export class OpenAiCompatProvider implements LlmProvider {
  readonly name = "openai_compat";

  constructor(private readonly opts: OpenAiCompatOptions) {}

  async complete(req: LlmRequest): Promise<LlmResult> {
    try {
      const res = await fetch(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.opts.model,
          max_tokens: 600,
          temperature: 0.4,
          messages: [{ role: "system", content: req.system }, ...req.messages],
        }),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
      if (res.status === 429) return { ok: false, reason: "rate_limited" };
      if (!res.ok) {
        console.error(`[llm] openai_compat HTTP ${res.status}`);
        return { ok: false, reason: "error" };
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null }; finish_reason?: string }[];
      };
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "content_filter") return { ok: false, reason: "refusal" };
      if (choice?.finish_reason === "length") return { ok: false, reason: "truncated" };
      const text = choice?.message?.content?.trim();
      return text ? { ok: true, text } : { ok: false, reason: "empty" };
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      console.error(`[llm] openai_compat ${timeout ? "timeout" : "request failed"}`);
      return { ok: false, reason: timeout ? "timeout" : "error" };
    }
  }
}
