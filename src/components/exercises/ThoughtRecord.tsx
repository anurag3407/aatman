"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
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
      <p className="text-sm text-muted">{t.privacy}</p>
      {FIELDS.map((f, i) => (
        <label key={f} className="flex flex-col gap-1">
          <span className="font-medium">
            {i + 1}. {t.steps[f].label}
          </span>
          <span className="text-sm text-muted">{t.steps[f].hint}</span>
          <textarea
            rows={f === "emotion" || f === "rerate" ? 2 : 3}
            value={values[f]}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            className="w-full rounded-xl border border-border bg-surface p-3 text-base focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
      ))}
      <div className="flex gap-2">
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
