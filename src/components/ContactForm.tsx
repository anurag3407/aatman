"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Banner, Button, Card, inputClass } from "./ui";

/** "Ask the counsellor to contact me": the only way results reach a person, and only on submit. */
export function ContactForm({ checkinId, defaultOpen = true }: { checkinId?: string; defaultOpen?: boolean }) {
  const { m } = useI18n();
  const t = m.results.contact;
  const [open, setOpen] = useState(defaultOpen);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const phone = String(form.get("phone") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    if (!phone && !email) return setError(t.needContact);
    if (form.get("consent") !== "on") return setError(t.needConsent);

    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkinId,
          name: String(form.get("name") ?? "").trim() || undefined,
          phone,
          email,
          bestTime: String(form.get("bestTime") ?? "").trim() || undefined,
          consent: true,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("sent");
    } catch {
      setStatus("idle");
      setError(m.common.genericError);
    }
  }

  if (status === "sent") return <Banner>{t.sent}</Banner>;

  return (
    <Card>
      <h2 className="font-serif text-[1.15rem] font-medium">{t.title}</h2>
      <p className="text-sm leading-relaxed text-muted">{t.body}</p>
      {!open ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t.title}
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          <label className="flex flex-col gap-1.5 text-sm">
            {t.name}
            <input name="name" maxLength={60} autoComplete="off" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            {t.phone}
            <input name="phone" type="tel" inputMode="tel" maxLength={20} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            {t.email}
            <input name="email" type="email" maxLength={120} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            {t.bestTime}
            <input name="bestTime" maxLength={80} className={inputClass} />
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-surface/50 px-4 py-3 text-sm">
            <input name="consent" type="checkbox" className="mt-0.5 size-5 accent-[var(--accent)]" />
            <span>{t.consent}</span>
          </label>
          {error && <Banner tone="urgent">{error}</Banner>}
          <Button type="submit" disabled={status === "sending"} className="w-full">
            {t.submit}
          </Button>
        </form>
      )}
    </Card>
  );
}
