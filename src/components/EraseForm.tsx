"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Banner, Button, Card, inputClass } from "./ui";

const CONFIRM_WORD = "ERASE";

export function EraseForm() {
  const { m } = useI18n();
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function erase() {
    setState("busy");
    try {
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      sessionStorage.clear();
      setState("done");
      // A full reload (not router.push) so no client state from the erased account survives.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      setTimeout(() => window.location.assign("/"), 2500);
    } catch {
      setState("error");
    }
  }

  if (state === "done") return <Banner>{m.settings.erased}</Banner>;

  return (
    <Card className="border-urgent">
      <h2 className="font-semibold">{m.settings.eraseTitle}</h2>
      <p className="text-sm text-muted">{m.settings.eraseBody}</p>
      <label className="flex flex-col gap-1 text-sm">
        {m.settings.eraseConfirm}
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputClass} />
      </label>
      {state === "error" && <Banner tone="urgent">{m.common.genericError}</Banner>}
      <Button variant="urgent" disabled={typed.trim() !== CONFIRM_WORD || state === "busy"} onClick={erase}>
        {m.settings.eraseCta}
      </Button>
    </Card>
  );
}
