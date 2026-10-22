"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { ICALL, TELE_MANAS } from "@/lib/safety/helplines";
import { Banner, Button, Card, inputClass } from "./ui";

interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  location: string;
  mode: "in_person" | "phone" | "video";
  status?: "open" | "booked" | "cancelled";
}

export function BookingView({ open, mine, hasCheckin }: { open: Slot[]; mine: Slot[]; hasCheckin: boolean }) {
  const { m, locale } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<Slot | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "urgent"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const when = (iso: string) => formatDate(iso, locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch(`/api/slots/${selected.id}/book`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ share: form.get("share") === "on", phone: String(form.get("phone") ?? "").trim() }),
      });
      if (res.ok) {
        setMessage({ tone: "info", text: m.book.booked });
        setSelected(null);
        router.refresh();
      } else {
        setMessage({ tone: "urgent", text: res.status === 409 ? m.book.taken : m.common.genericError });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/slots/${id}/cancel`, { method: "POST" });
      setMessage(res.ok ? { tone: "info", text: m.book.cancelled } : { tone: "urgent", text: m.common.genericError });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      <div className={`grid gap-5 lg:items-start ${mine.length > 0 ? "lg:grid-cols-2" : "lg:max-w-2xl"}`}>
        {mine.length > 0 && (
          <Card className="min-w-0">
            <h2 className="font-semibold">{m.book.yourBookings}</h2>
            <ul className="flex flex-col gap-3">
              {mine.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 border-t border-border pt-3 first:border-0 first:pt-0">
                  <span className="font-medium">{when(s.startsAt)}</span>
                  <span className="text-sm text-muted">
                    {m.book.mode[s.mode]} · {s.location}
                  </span>
                  {s.status === "cancelled" ? (
                    <span className="text-sm text-urgent">{m.book.cancelled}</span>
                  ) : (
                    <Button variant="ghost" className="self-start" disabled={busy} onClick={() => cancel(s.id)}>
                      {m.book.cancelBooking}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex min-w-0 flex-col gap-4">
          {open.length === 0 ? (
            <Card>
              <p>{m.book.none}</p>
              {[TELE_MANAS, ICALL].map((h) => (
                <a key={h.id} href={`tel:${h.tel}`} className="flex flex-wrap justify-between gap-2 rounded-md border border-border px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{h.name[locale]}</span>
                    <span className="text-sm text-muted">{h.hours[locale]}</span>
                  </span>
                  <span className="font-semibold text-accent">{h.number}</span>
                </a>
              ))}
            </Card>
          ) : selected ? (
            <Card>
              <h2 className="font-semibold">{m.book.confirmTitle}</h2>
              <p>
                {when(selected.startsAt)} · {m.book.mode[selected.mode]} · {selected.location}
              </p>
              <form onSubmit={confirm} className="flex flex-col gap-3">
                {hasCheckin && (
                  <label className="flex items-start gap-3 text-sm">
                    <input name="share" type="checkbox" className="mt-1 size-5 accent-[var(--accent)]" />
                    <span>
                      {m.book.share}
                      <span className="block text-muted">{m.book.shareHint}</span>
                    </span>
                  </label>
                )}
                <label className="flex flex-col gap-1 text-sm">
                  {m.book.phone}
                  <input name="phone" type="tel" inputMode="tel" maxLength={20} className={inputClass} />
                </label>
                <Button type="submit" disabled={busy}>
                  {m.book.confirm}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                  {m.common.cancel}
                </Button>
              </form>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {open.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(s);
                      setMessage(null);
                    }}
                    className="flex min-h-14 w-full items-center justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3 text-left transition hover:border-accent/50 hover:bg-accent-soft sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{when(s.startsAt)}</span>
                      <span className="text-sm text-muted">
                        {m.book.mode[s.mode]} · {s.location}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-accent">{m.book.book}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
