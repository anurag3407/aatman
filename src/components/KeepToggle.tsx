"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";

/** Exempts a check-in from automatic retention deletion. */
export function KeepToggle({ id, initial }: { id: string; initial: boolean }) {
  const { m } = useI18n();
  const [keep, setKeep] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/checkins/${id}/keep`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keep: !keep }),
      });
      if (res.ok) setKeep(!keep);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-pressed={keep}
      disabled={busy}
      onClick={toggle}
      className={`rounded-full px-3 py-2 text-xs font-medium transition duration-300 ${
        keep ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface/70 hover:text-foreground"
      }`}
    >
      {keep ? `✓ ${m.history.kept}` : m.history.keep}
    </button>
  );
}
