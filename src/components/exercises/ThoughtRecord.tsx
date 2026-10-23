"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { CompanionMark } from "@/components/Companion";
import { Button } from "@/components/ui";

const FIELDS = ["situation", "thought", "emotion", "evidenceFor", "evidenceAgainst", "balanced", "rerate"] as const;
type Field = (typeof FIELDS)[number];

/** CBT thought record. Lives only in component state; download is the only way it leaves the page. */
export function ThoughtRecord() {
  const { m } = useI18n();
  const t = m.exercises.thought;
  const [values, setValues] = useState<Record<Field, string>>(() => Object.fromEntries(FIELDS.map((f) => [f, ""])) as Record<Field, string>);

  function download() {
    const text = FIELDS.map((f) => `${t.steps[f].label}\n${values[f] || "-"}\n`).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "thought-record.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
      <p className="flex items-center gap-2 px-1 text-xs leading-relaxed text-muted">
        <CompanionMark className="h-6 w-6 shrink-0" breathing={false} />
        {t.privacy}
      </p>

      <div className="stagger flex flex-col gap-3">
        {FIELDS.map((f, i) => (
          <label
            key={f}
            className="card-soft flex flex-col gap-2 rounded-[1.5rem] border border-border/75 bg-surface/75 p-4 sm:p-5"
          >
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft/80 text-[0.7rem] font-semibold text-accent"
              >
                {i + 1}
              </span>
              <span className="font-serif text-[1.02rem] leading-snug">{t.steps[f].label}</span>
            </span>
            <span className="pl-[2.1rem] text-xs leading-relaxed text-muted">{t.steps[f].hint}</span>
            <textarea
              rows={f === "emotion" || f === "rerate" ? 2 : 3}
              value={values[f]}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
              className="min-h-12 w-full resize-y rounded-2xl border border-border/60 bg-background/35 px-4 py-3 text-base leading-relaxed text-foreground placeholder:text-muted/80 transition focus-visible:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/40"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={download}>
          {t.download}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setValues(Object.fromEntries(FIELDS.map((f) => [f, ""])) as Record<Field, string>)}
        >
          {t.clear}
        </Button>
      </div>
    </form>
  );
}
