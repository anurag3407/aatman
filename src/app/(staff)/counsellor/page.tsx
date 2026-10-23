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
        <h1 className="font-serif text-[1.85rem] font-medium leading-tight tracking-[-0.015em]">Contact requests</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Students who asked to be contacted. Most severe first. Opening a request is recorded in the audit log.
        </p>
        {requests.length === 0 ? (
          <p className="text-muted">No open requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/counsellor/requests/${r.id}`}
                  className="card-soft flex items-center justify-between gap-3 rounded-[1.2rem] border border-border/75 bg-surface/75 px-4 py-3 transition duration-300 hover:border-accent/40 hover:bg-accent-soft/30"
                >
                  <span className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TIER_BADGE[r.tier]}`}>{TIER_LABELS[r.tier]}</span>
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
        <h2 className="font-serif text-[1.3rem] font-medium">Upcoming booked sessions</h2>
        {booked.length === 0 ? (
          <p className="text-muted">No booked sessions.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {booked.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/counsellor/bookings/${s.id}`}
                  className="card-soft flex items-center justify-between gap-3 rounded-[1.2rem] border border-border/75 bg-surface/75 px-4 py-3 transition duration-300 hover:border-accent/40 hover:bg-accent-soft/30"
                >
                  <span>
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
