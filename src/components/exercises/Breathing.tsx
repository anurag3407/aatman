"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { CompanionMark } from "@/components/Companion";
import { Button } from "@/components/ui";

const PHASE_SECONDS = 4;
const PHASES = ["in", "hold", "out", "hold"] as const;

/** Box breathing: 4 s in, 4 s hold, 4 s out, 4 s hold. The orb scale and text both carry the phase. */
export function Breathing() {
  const { m } = useI18n();
  const t = m.exercises.breathing;
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const phaseIndex = Math.floor(tick / PHASE_SECONDS) % PHASES.length;
  const phase = PHASES[phaseIndex];
  const secondsLeft = PHASE_SECONDS - (tick % PHASE_SECONDS);
  const round = Math.floor(tick / (PHASE_SECONDS * PHASES.length)) + 1;
  const expanded = running && (phase === "in" ? true : phase === "out" ? false : phaseIndex === 1);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex h-64 w-64 items-center justify-center">
        <div aria-hidden className="absolute inset-0 rounded-full border border-border/50" />
        <div aria-hidden className="absolute inset-8 rounded-full border border-border/35" />
        <div aria-hidden className="absolute inset-16 rounded-full border border-border/25" />
        <div className="relative flex h-44 w-44 items-center justify-center">
          <div
            aria-hidden
            className="orb-core absolute inset-0 rounded-full transition-transform ease-in-out motion-reduce:transition-none"
            style={{ transform: `scale(${expanded ? 1 : 0.62})`, transitionDuration: `${PHASE_SECONDS}s` }}
          />
          <CompanionMark className="relative h-14 w-14 opacity-90" breathing={false} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2.5 text-center">
        <p aria-live="polite" className="font-serif text-[1.7rem] font-medium leading-tight">
          {running ? (
            <>
              {t[phase]} <span className="text-muted tabular-nums">{secondsLeft}</span>
            </>
          ) : (
            m.companion.checkin
          )}
        </p>
        <div aria-hidden className="flex items-center gap-1.5">
          {PHASES.map((p, i) => (
            <span
              key={`${p}-${i}`}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                running && i === phaseIndex ? "w-8 bg-accent" : "w-3 bg-border"
              }`}
            />
          ))}
        </div>
        {running && <p className="text-sm text-muted">{fmt(t.rounds, { n: round })}</p>}
      </div>

      <Button
        onClick={() => {
          setRunning((r) => !r);
          setTick(0);
        }}
        className="w-44"
      >
        {running ? t.stop : t.start}
      </Button>
    </div>
  );
}
