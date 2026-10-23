"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { ANTI_RAGGING } from "@/lib/safety/helplines";
import { detectCrisis } from "@/lib/safety/crisisDetector";
import { CrisisActions } from "./CrisisActions";
import { Banner, Button, Card } from "./ui";

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
      <Banner>
        {m.chat.noNames} {m.chat.notSaved}
      </Banner>

      <ol className="flex flex-col gap-3" aria-live="polite">
        {turns.map((t, i) => (
          <li
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              t.role === "user" ? "self-end rounded-br-sm bg-accent text-accent-foreground" : "self-start rounded-bl-sm border border-border bg-surface"
            }`}
          >
            <span className="sr-only">{t.role === "user" ? m.chat.you : m.chat.companion}: </span>
            {t.content}
          </li>
        ))}
        {sending && <li className="self-start text-muted">…</li>}
      </ol>

      {paused === "safety" && (
        <>
          <Card>
            <h2 className="font-semibold">{m.chat.pausedTitle}</h2>
            <p className="text-muted">{m.chat.pausedBody}</p>
          </Card>
          <CrisisActions m={m} tone="urgent" />
        </>
      )}
      {paused === "ragging" && (
        <Card>
          <h2 className="font-semibold">{m.chat.pausedTitle}</h2>
          <p className="text-muted">{m.chat.raggingBody}</p>
          <a href={`tel:${ANTI_RAGGING.tel}`} className="font-semibold text-accent underline underline-offset-4">
            {ANTI_RAGGING.name[locale]} · {ANTI_RAGGING.number}
          </a>
        </Card>
      )}
      {paused === "limit" && <Banner>{m.chat.limit}</Banner>}

      {!paused && (
        <form onSubmit={send} className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder={m.chat.placeholder}
            aria-label={m.chat.placeholder}
            className="w-full rounded-xl border border-border bg-surface p-4 text-base focus-visible:outline-2 focus-visible:outline-accent"
          />
          <Button type="submit" disabled={sending || !draft.trim()}>
            {m.chat.send}
          </Button>
        </form>
      )}
      <div ref={endRef} />
    </div>
  );
}
