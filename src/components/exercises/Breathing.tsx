"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui";

const PHASE_SECONDS = 4;
const PHASES = ["in", "hold", "out", "hold"] as const;

/** Box breathing: 4 s in, 4 s hold, 4 s out, 4 s hold. The circle scale and text both carry the phase. */
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
    <div className="flex flex-col items-center gap-6">
      <div className="flex h-64 w-64 items-center justify-center">
        <div
          aria-hidden
          className="flex h-full w-full items-center justify-center rounded-full bg-accent-soft transition-transform ease-in-out motion-reduce:transition-none"
          style={{ transform: `scale(${expanded ? 1 : 0.6})`, transitionDuration: `${PHASE_SECONDS}s` }}
        />
      </div>
      <p aria-live="polite" className="text-center text-2xl font-semibold">
        {running ? (
          <>
            {t[phase]} <span className="text-muted">{secondsLeft}</span>
          </>
        ) : (
          t.desc
        )}
      </p>
      {running && <p className="text-sm text-muted">{fmt(t.rounds, { n: round })}</p>}
      <Button
        onClick={() => {
          setRunning((r) => !r);
          setTick(0);
        }}
        className="w-40"
      >
        {running ? t.stop : t.start}
      </Button>
    </div>
  );
}
