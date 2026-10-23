"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { CompanionMark } from "@/components/Companion";
import { Button, SectionLabel } from "@/components/ui";

export function Grounding() {
  const { m } = useI18n();
  const t = m.exercises.grounding;
  const [step, setStep] = useState(0);
  const finished = step >= t.steps.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="card-soft relative overflow-hidden rounded-[1.9rem] border border-border/75 bg-surface/80 p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-14 -top-16 size-48 rounded-full bg-sky/25 blur-3xl" />
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky/25">
            <CompanionMark className="h-7 w-7" breathing={false} />
          </span>
          <SectionLabel>5 · 4 · 3 · 2 · 1</SectionLabel>
        </div>

        <p aria-live="polite" className="min-h-32 py-5 font-serif text-[1.65rem] font-medium leading-snug text-pretty sm:text-[1.85rem]">
          {finished ? t.done : t.steps[step]}
        </p>

        <ol className="flex gap-1.5" aria-hidden>
          {t.steps.map((_, i) => (
            <li
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                i < step ? "bg-accent" : "bg-accent-soft"
              }`}
            />
          ))}
        </ol>
      </div>

      {finished ? (
        <Button variant="secondary" className="w-full" onClick={() => setStep(0)}>
          {t.restart}
        </Button>
      ) : (
        <Button className="w-full" onClick={() => setStep((s) => s + 1)}>
          {m.common.next}
        </Button>
      )}
    </div>
  );
}
