"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { ICALL, TELE_MANAS } from "@/lib/safety/helplines";
import { CompanionMark } from "./Companion";
import { Banner, Button, Card, inputClass } from "./ui";

interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  location: string;
  mode: "in_person" | "phone" | "video";
  isUrgent: boolean;
  counsellorName: string | null;
  counsellorLanguages: string | null;
}

interface Mine extends Slot {
  status: "open" | "booked" | "cancelled";
  reminderOptIn?: boolean;
}

export function BookingView({ open, mine, hasCheckin }: { open: Slot[]; mine: Mine[]; hasCheckin: boolean }) {
  const { m, locale } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<Slot | null>(null);
  const [rescheduling, setRescheduling] = useState<Mine | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "urgent"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const when = (iso: string) =>
    formatDate(iso, locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch(`/api/slots/${selected.id}/book`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          share: form.get("share") === "on",
          phone: String(form.get("phone") ?? "").trim(),
          remind: form.get("remind") === "on",
        }),
      });
      if (res.ok) {
        setMessage({ tone: "info", text: m.book.booked });
        setSelected(null);
        router.refresh();
      } else {
        const status = res.status;
        setMessage({
          tone: "urgent",
          text: status === 403 ? m.book.notEligible : status === 409 ? m.book.taken : m.common.genericError,
        });
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

  async function reschedule(toId: string) {
    if (!rescheduling) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/slots/${rescheduling.id}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newSlotId: toId }),
      });
      if (res.ok) {
        setMessage({ tone: "info", text: m.book.rescheduled });
        setRescheduling(null);
        router.refresh();
      } else {
        const status = res.status;
        setMessage({
          tone: "urgent",
          text: status === 403 ? m.book.notEligible : status === 409 ? m.book.taken : m.common.genericError,
        });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const counsellorLine = (s: Slot) =>
    s.counsellorName ? `${s.counsellorName}${s.counsellorLanguages ? ` · ${s.counsellorLanguages}` : ""}` : null;

  return (
    <div className="flex flex-col gap-4">
      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {mine.length > 0 && (
        <Card className="animate-rise">
          <h2 className="font-serif text-[1.15rem] font-medium">{m.book.yourBookings}</h2>
          <ul className="flex flex-col divide-y divide-border/60">
            {mine.map((s) => (
              <li key={s.id} className="flex flex-col gap-1.5 py-3 first:pt-1 last:pb-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-serif text-[1.05rem] leading-snug">{when(s.startsAt)}</span>
                  {s.isUrgent && (
                    <span className="rounded-full border border-urgent/40 px-2 py-0.5 text-[0.68rem] font-semibold text-urgent">
                      {m.book.priority}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted">
                  {m.book.mode[s.mode]} · {s.location}
                  {counsellorLine(s) ? ` · ${counsellorLine(s)}` : ""}
                </span>
                {s.status === "cancelled" ? (
                  <span className="text-sm text-urgent">{m.book.cancelled}</span>
                ) : (
                  <span className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      className="min-h-9 self-start px-3 text-sm"
                      disabled={busy}
                      onClick={() => {
                        setRescheduling(rescheduling?.id === s.id ? null : s);
                        setSelected(null);
                        setMessage(null);
                      }}
                    >
                      {rescheduling?.id === s.id ? m.book.stopReschedule : m.book.reschedule}
                    </Button>
                    <Button variant="ghost" className="min-h-9 self-start px-3 text-sm" disabled={busy} onClick={() => cancel(s.id)}>
                      {m.book.cancelBooking}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rescheduling && (
        <Banner tone="info">{m.book.chooseNewTime.replace("{when}", when(rescheduling.startsAt))}</Banner>
      )}

      {open.length === 0 ? (
        <Card className="animate-rise">
          <div className="flex items-start gap-3">
            <CompanionMark className="h-10 w-10 shrink-0" />
            <p className="pt-1.5 text-sm leading-relaxed">{m.book.none}</p>
          </div>
          <div className="mt-1 flex flex-col gap-2">
            {[TELE_MANAS, ICALL].map((h) => (
              <a
                key={h.id}
                href={`tel:${h.tel}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-surface/60 px-4 py-3 transition duration-300 hover:border-accent/40 hover:bg-accent-soft/30"
              >
                <span>
                  <span className="block font-medium">{h.name[locale]}</span>
                  <span className="text-xs text-muted">{h.hours[locale]}</span>
                </span>
                <span className="shrink-0 font-semibold text-accent">{h.number}</span>
              </a>
            ))}
          </div>
        </Card>
      ) : selected ? (
        <Card className="animate-rise">
          <h2 className="font-serif text-[1.2rem] font-medium">{m.book.confirmTitle}</h2>
          <div className="rounded-2xl bg-accent-soft/50 px-4 py-3">
            <p className="font-serif text-[1.02rem] leading-snug">{when(selected.startsAt)}</p>
            <p className="mt-0.5 text-xs text-muted">
              {m.book.mode[selected.mode]} · {selected.location}
              {counsellorLine(selected) ? ` · ${counsellorLine(selected)}` : ""}
            </p>
            {selected.isUrgent && (
              <p className="mt-1.5 text-xs font-semibold text-urgent">
                {m.book.priority} — {m.book.priorityHint}
              </p>
            )}
          </div>
          <form onSubmit={confirm} className="flex flex-col gap-3">
            {hasCheckin && (
              <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-surface/50 px-4 py-3 text-sm">
                <input name="share" type="checkbox" className="mt-0.5 size-5 accent-[var(--accent)]" />
                <span>
                  {m.book.share}
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{m.book.shareHint}</span>
                </span>
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm">
              {m.book.phone}
              <input name="phone" type="tel" inputMode="tel" maxLength={20} className={inputClass} />
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-surface/50 px-4 py-3 text-sm">
              <input name="remind" type="checkbox" className="mt-0.5 size-5 accent-[var(--accent)]" />
              <span>
                {m.book.reminder}
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{m.book.reminderHint}</span>
              </span>
            </label>
            <Button type="submit" disabled={busy} className="w-full">
              {m.book.confirm}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setSelected(null)}>
              {m.common.cancel}
            </Button>
          </form>
        </Card>
      ) : (
        <ul className="stagger flex flex-col gap-2">
          {open.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (rescheduling) void reschedule(s.id);
                  else {
                    setSelected(s);
                    setMessage(null);
                  }
                }}
                className="card-soft group flex min-h-16 w-full items-center justify-between gap-4 rounded-[1.4rem] border border-border/75 bg-surface/75 px-5 py-4 text-left transition duration-300 hover:border-accent/40 hover:bg-accent-soft/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-[1.05rem] leading-snug">{when(s.startsAt)}</span>
                    {s.isUrgent && (
                      <span className="rounded-full border border-urgent/40 px-2 py-0.5 text-[0.68rem] font-semibold text-urgent">
                        {m.book.priority}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted">
                    {m.book.mode[s.mode]} · {s.location}
                    {counsellorLine(s) ? ` · ${counsellorLine(s)}` : ""}
                  </span>
                  {s.isUrgent && <span className="text-[0.7rem] text-muted">{m.book.priorityHint}</span>}
                </span>
                <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">
                  {rescheduling ? m.book.reschedule : m.book.book}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
