"use client";

import { useEffect } from "react";
import { IconExit } from "./icons";

const NEUTRAL_URL = "https://www.google.com/search?q=weather";

/** Clears local drafts and replaces this page in history, so Back doesn't return here. */
export function quickExit() {
  try {
    sessionStorage.clear();
  } catch {
    // Storage may be blocked; leaving matters more.
  }
  window.location.replace(NEUTRAL_URL);
}

/** Also triggered by pressing Escape twice within a second. */
export function QuickExit({ label, hint }: { label: string; hint: string }) {
  useEffect(() => {
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const now = Date.now();
      if (now - last < 1000) quickExit();
      last = now;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <button
      type="button"
      onClick={quickExit}
      aria-label={hint}
      title={hint}
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.8rem] font-medium text-muted transition duration-300 hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <IconExit className="h-[1.05rem] w-[1.05rem]" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
