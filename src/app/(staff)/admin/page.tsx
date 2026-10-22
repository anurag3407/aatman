import { requireStaffPage } from "@/lib/auth/guards";
import { K_MIN, serviceStats, weeklyTierCounts, type Cell } from "@/lib/services/aggregates";
import { TIERS } from "@/lib/safety/triage";
import { TIER_LABELS } from "@/lib/staffLabels";

const show = (c: Cell) => (c === "suppressed" ? `<${K_MIN}` : c.toLocaleString("en-IN"));

/** Aggregates only. No query on this page can return an individual student's data. */
export default async function AdminDashboard() {
  await requireStaffPage(["admin", "counsellor"]);
  const [weeks, stats] = await Promise.all([weeklyTierCounts(12), serviceStats(28)]);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-black leading-tight tracking-tight sm:text-3xl">Wellbeing overview</h1>
        <p className="text-sm text-muted">
          Totals only. Any count below {K_MIN} is hidden (and one more cell, so it can&apos;t be worked out from the total).
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Slots offered (28 days)" value={show(stats.slotsOffered)} />
        <Stat label="Slots booked (28 days)" value={show(stats.slotsBooked)} />
        <Stat label="Contact requests (28 days)" value={show(stats.contactRequests)} />
        <Stat
          label="Median hours to first contact"
          value={stats.medianHoursToContact === null ? "–" : String(stats.medianHoursToContact)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Check-ins by week</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2">Week of</th>
                <th>Students</th>
                <th>Check-ins</th>
                {TIERS.map((t) => (
                  <th key={t}>{TIER_LABELS[t]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.weekStart} className="border-t border-border">
                  <td className="py-2">{w.weekStart}</td>
                  <td>{show(w.students)}</td>
                  <td>{show(w.total)}</td>
                  {TIERS.map((t) => (
                    <td key={t}>{show(w.byTier[t])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {weeks.length === 0 && <p className="text-muted">No check-ins yet.</p>}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
