import "server-only";
import { env } from "@/lib/env";
import { messagesFor, type Locale } from "@/lib/i18n";
import type { CampusAnswers } from "@/lib/checkin/flow";
import { detectCrisisInAll } from "@/lib/safety/crisisDetector";
import type { Tier, TriageResult } from "@/lib/safety/triage";
import { scrubForLlm } from "@/lib/privacy/server";
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import { OpenAiCompatProvider } from "./openaiCompat";
import { guardOutput } from "./outputGuard";
import { reflectSystemPrompt, summarySystemPrompt, summaryUserMessage } from "./prompts";
import type { LlmProvider, LlmTurn } from "./provider";

let provider: LlmProvider | null | undefined;

export function getProvider(): LlmProvider | null {
  if (provider !== undefined) return provider;
  const e = env();
  switch (e.LLM_PROVIDER) {
    case "anthropic":
      provider = e.ANTHROPIC_API_KEY
        ? new AnthropicProvider({
            apiKey: e.ANTHROPIC_API_KEY,
            model: e.LLM_MODEL,
            timeoutMs: e.LLM_TIMEOUT_MS,
            refusalFallback: e.LLM_REFUSAL_FALLBACK,
          })
        : null;
      break;
    case "openai_compat":
      provider =
        e.OPENAI_COMPAT_BASE_URL && e.LLM_MODEL
          ? new OpenAiCompatProvider({
              baseUrl: e.OPENAI_COMPAT_BASE_URL,
              apiKey: e.OPENAI_COMPAT_API_KEY,
              model: e.LLM_MODEL,
              timeoutMs: e.LLM_TIMEOUT_MS,
            })
          : null;
      break;
    case "mock":
      provider = new MockProvider();
      break;
    default:
      provider = null;
  }
  if (e.LLM_PROVIDER !== "none" && !provider) console.warn(`[llm] ${e.LLM_PROVIDER} selected but not configured; using templates`);
  return provider;
}

export function llmAvailable(): boolean {
  return getProvider() !== null;
}

export interface Summary {
  text: string;
  source: "llm" | "template";
}

export function templateSummary(tier: Tier, locale: Locale): Summary {
  return { text: messagesFor(locale).templates[tier], source: "template" };
}

const MOOD_LEVEL = { minimal: "low", mild: "mild", moderate: "moderate", moderately_severe: "high", severe: "very high" } as const;
const WORRY_LEVEL = { minimal: "low", mild: "mild", moderate: "moderate", severe: "high" } as const;

/** Scores-only note. Higher tiers, ragging and any provider or guard failure get the template. */
export async function summarize(
  triage: Pick<TriageResult, "tier" | "scores" | "llmAllowed">,
  campus: CampusAnswers, locale: Locale): Promise<Summary> {
  const llm = getProvider();
  if (!llm || !triage.llmAllowed || campus.safety === "yes") return templateSummary(triage.tier, locale);

  const { phq9, gad7, phq2, gad2 } = triage.scores;
  const moodLevel = phq9.band ? MOOD_LEVEL[phq9.band] : phq2.band === "positive" ? "elevated on a short screen" : phq2.band ? "low on a short screen" : null;
  const worryLevel = gad7.band ? WORRY_LEVEL[gad7.band] : gad2.band === "positive" ? "elevated on a short screen" : gad2.band ? "low on a short screen" : null;

  const result = await llm.complete({
    system: summarySystemPrompt(locale, triage.tier),
    messages: [
      {
        role: "user",
        content: summaryUserMessage({
          tier: triage.tier,
          moodLevel,
          worryLevel,
          sleepDifficult: (campus.sleep ?? 0) >= 2,
          academicPressureHigh: (campus.academics ?? 0) >= 2,
        }),
      },
    ],
  });
  if (!result.ok) return templateSummary(triage.tier, locale);
  const guarded = guardOutput(result.text, "summary");
  if (!guarded.ok) {
    console.warn(`[llm] summary blocked by guard: ${guarded.reason}`);
    return templateSummary(triage.tier, locale);
  }
  return { text: guarded.text, source: "llm" };
}

export type ChatOutcome =
  | { type: "reply"; text: string; source: "llm" | "template" }
  | { type: "safety"; level: "passive" | "self_harm" | "acute" }
  | { type: "ragging" }
  | { type: "unavailable" };

const MAX_TURNS = 12;

/**
 * One reflective-chat turn. The deterministic crisis check runs on every student message
 * before anything reaches the model. A hit pauses the chat and the UI shows people to call.
 */
export async function reflect(history: LlmTurn[], locale: Locale): Promise<ChatOutcome> {
  const studentText = history.filter((t) => t.role === "user").map((t) => t.content);
  const detection = detectCrisisInAll(studentText);
  if (detection.level !== "none") return { type: "safety", level: detection.level };
  if (detection.ragging) return { type: "ragging" };

  const llm = getProvider();
  if (!llm) return { type: "unavailable" };

  const messages = history.slice(-MAX_TURNS).map((t) => (t.role === "user" ? { ...t, content: scrubForLlm(t.content) } : t));
  // The API requires the first turn to be the user's.
  while (messages.length && messages[0].role !== "user") messages.shift();

  const fallback = { type: "reply", text: messagesFor(locale).chat.fallback, source: "template" } as const;
  const result = await llm.complete({ system: reflectSystemPrompt(), messages });
  if (!result.ok) return fallback;
  const guarded = guardOutput(result.text, "chat");
  if (!guarded.ok) {
    console.warn(`[llm] chat reply blocked by guard: ${guarded.reason}`);
    return fallback;
  }
  return { type: "reply", text: guarded.text, source: "llm" };
}

/** Tests swap providers. */
export function resetProviderCache() {
  provider = undefined;
}
