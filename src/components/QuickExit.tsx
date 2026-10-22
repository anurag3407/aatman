"use client";

import { useEffect } from "react";

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
      className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent"
    >
      {label}
    </button>
  );
}
