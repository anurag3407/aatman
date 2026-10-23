"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui";

export function Grounding() {
  const { m } = useI18n();
  const t = m.exercises.grounding;
  const [step, setStep] = useState(0);
  const finished = step >= t.steps.length;

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-2" aria-hidden>
        {t.steps.map((_, i) => (
          <li key={i} className={`h-2 flex-1 rounded-full ${i < step ? "bg-accent" : "bg-accent-soft"}`} />
        ))}
      </ol>
      <p aria-live="polite" className="min-h-24 text-2xl font-semibold leading-snug">
        {finished ? t.done : t.steps[step]}
      </p>
      {finished ? (
        <Button variant="secondary" onClick={() => setStep(0)}>
          {t.restart}
        </Button>
      ) : (
        <Button onClick={() => setStep((s) => s + 1)}>{m.common.next}</Button>
      )}
    </div>
  );
}
