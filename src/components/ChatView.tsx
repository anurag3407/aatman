"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { ANTI_RAGGING } from "@/lib/safety/helplines";
import { detectCrisis } from "@/lib/safety/crisisDetector";
import { CompanionMark } from "./Companion";
import { CrisisActions } from "./CrisisActions";
import { Banner, Card } from "./ui";
import { IconArrowUp } from "./icons";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

type Paused = null | "safety" | "ragging" | "limit";

/**
 * The conversation lives only in this component's state, and nothing is stored.
 * Every message is checked on-device before sending (the server checks again), so a
 * crisis message shows support at once and never goes to the model.
 */
export function ChatView() {
  const { m, locale } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState<Paused>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, paused]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setDraft("");

    const local = detectCrisis(content);
    if (local.level !== "none") return setPaused("safety");
    if (local.ragging) return setPaused("ragging");

    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, locale }),
      });
      const data = (await res.json()) as { type: string; text?: string };
      if (data.type === "reply" && data.text) setTurns((t) => [...t, { role: "assistant", content: data.text! }]);
      else if (data.type === "safety") setPaused("safety");
      else if (data.type === "ragging") setPaused("ragging");
      else if (data.type === "limit") setPaused("limit");
      else setTurns((t) => [...t, { role: "assistant", content: m.chat.fallback }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", content: m.chat.fallback }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
        <CompanionMark className="mt-0.5 h-5 w-5 shrink-0 opacity-80" breathing={false} />
        <span>
          {m.chat.noNames} {m.chat.notSaved}
        </span>
      </p>

      {turns.length === 0 && !paused && (
        <div className="animate-rise flex flex-col items-center gap-4 rounded-[1.8rem] border border-border/60 bg-surface/45 px-6 py-10 text-center">
          <CompanionMark className="h-20 w-20" />
          <p className="max-w-xs font-serif text-[1.35rem] leading-snug text-pretty">{m.companion.here}</p>
          <p className="max-w-xs text-sm leading-relaxed text-muted">{m.chat.intro}</p>
        </div>
      )}

      <ol className="flex flex-col gap-3" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className={`flex items-end gap-2 ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            {t.role === "assistant" && (
              <span className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft/70">
                <CompanionMark className="h-6 w-6" breathing={false} />
              </span>
            )}
            <div
              className={`max-w-[82%] px-4 py-3 text-[0.95rem] leading-relaxed ${
                t.role === "user"
                  ? "rounded-[1.4rem] rounded-br-md bg-accent text-accent-foreground"
                  : "rounded-[1.4rem] rounded-bl-md border border-border/70 bg-surface/80"
              }`}
            >
              <span className="sr-only">{t.role === "user" ? m.chat.you : m.chat.companion}: </span>
              {t.content}
            </div>
          </li>
        ))}
        {sending && (
          <li className="flex items-end gap-2">
            <span className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft/70">
              <CompanionMark className="h-6 w-6" breathing={false} />
            </span>
            <span className="flex gap-1 rounded-[1.4rem] rounded-bl-md border border-border/70 bg-surface/80 px-4 py-3.5">
              <span className="size-1.5 animate-pulse rounded-full bg-muted" />
              <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:180ms]" />
              <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:360ms]" />
              <span className="sr-only">{m.chat.companion}</span>
            </span>
          </li>
        )}
      </ol>

      {paused === "safety" && (
        <>
          <Card className="border-urgent/30">
            <h2 className="font-serif text-xl font-medium">{m.chat.pausedTitle}</h2>
            <p className="text-muted">{m.chat.pausedBody}</p>
          </Card>
          <CrisisActions m={m} tone="urgent" />
        </>
      )}
      {paused === "ragging" && (
        <Card>
          <h2 className="font-serif text-xl font-medium">{m.chat.pausedTitle}</h2>
          <p className="text-muted">{m.chat.raggingBody}</p>
          <a href={`tel:${ANTI_RAGGING.tel}`} className="font-semibold text-accent underline underline-offset-4">
            {ANTI_RAGGING.name[locale]} · {ANTI_RAGGING.number}
          </a>
        </Card>
      )}
      {paused === "limit" && <Banner>{m.chat.limit}</Banner>}

      {!paused && (
        <form onSubmit={send} className="sticky bottom-24 z-10">
          <div className="glass card-soft flex items-end gap-2 rounded-[1.6rem] border border-border/70 p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder={m.chat.placeholder}
              aria-label={m.chat.placeholder}
              className="min-h-12 w-full resize-none rounded-[1.2rem] border-0 bg-transparent px-3 py-2.5 text-base leading-relaxed text-foreground placeholder:text-muted/80 focus-visible:outline-none"
            />
            <button
              type="submit"
              aria-label={m.chat.send}
              disabled={sending || !draft.trim()}
              className="mb-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md shadow-accent/25 transition duration-300 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:shadow-none"
            >
              <IconArrowUp className="h-5 w-5" />
            </button>
          </div>
        </form>
      )}
      <div ref={endRef} />
    </div>
  );
}
