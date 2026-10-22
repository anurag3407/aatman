import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n";
import { listStaffSlots } from "@/lib/services/booking";
import { listContactRequests } from "@/lib/services/contactRequests";
import { TIER_BADGE, TIER_LABELS } from "@/lib/staffLabels";

const when = (d: Date) => formatDate(d, "en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function CounsellorHome() {
  await requireStaffPage(["counsellor"]);
  const [requests, slots] = await Promise.all([listContactRequests(["new", "contacted"]), listStaffSlots()]);
  const booked = slots.filter((s) => s.status === "booked");

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-black leading-tight tracking-tight sm:text-3xl">Contact requests</h1>
        <p className="text-sm text-muted">
          Students who asked to be contacted. Most severe first. Opening a request is recorded in the audit log.
        </p>
        {requests.length === 0 ? (
          <p className="text-muted">No open requests.</p>
        ) : (
          <ul className="grid gap-2 xl:grid-cols-2">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/counsellor/requests/${r.id}`}
                  className="flex h-full flex-col gap-2 rounded-md border border-border bg-surface px-4 py-3 transition hover:border-accent/50 hover:bg-accent-soft sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-md px-3 py-1 text-xs font-semibold ${TIER_BADGE[r.tier]}`}>{TIER_LABELS[r.tier]}</span>
                    <span>{when(r.createdAt)}</span>
                  </span>
                  <span className="text-sm text-muted">{r.status === "new" ? "New" : `Contacted by ${r.handledBy}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Upcoming booked sessions</h2>
        {booked.length === 0 ? (
          <p className="text-muted">No booked sessions.</p>
        ) : (
          <ul className="grid gap-2 xl:grid-cols-2">
            {booked.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/counsellor/bookings/${s.id}`}
                  className="flex h-full flex-col gap-2 rounded-md border border-border bg-surface px-4 py-3 transition hover:border-accent/50 hover:bg-accent-soft sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    {when(s.startsAt)} · {s.location}
                  </span>
                  <span className="text-sm text-muted">{s.shared ? "Check-in shared" : "Not shared"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
