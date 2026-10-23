import { requireStaffPage } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n";
import { listStaffSlots } from "@/lib/services/booking";
import { cancelSlotAction, createSlotsAction } from "../../actions";

const field = "min-h-11 rounded-xl border border-border/80 bg-surface/70 px-3";

export default async function SlotsPage() {
  await requireStaffPage(["counsellor"]);
  const slots = await listStaffSlots();

  return (
    <>
      <h1 className="font-serif text-[1.85rem] font-medium leading-tight tracking-[-0.015em]">Session slots</h1>

      <form action={createSlotsAction} className="card-soft grid gap-3 rounded-[1.4rem] border border-border/75 bg-surface/75 p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          First slot (IST)
          <input type="datetime-local" name="start" required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Minutes each
          <input type="number" name="duration" defaultValue={45} min={15} max={120} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Back-to-back slots that day
          <input type="number" name="perDay" defaultValue={4} min={1} max={12} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Repeat weekly for (weeks)
          <input type="number" name="weeks" defaultValue={1} min={1} max={12} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Location
          <input name="location" required defaultValue="Counselling Room, Student Activity Centre" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mode
          <select name="mode" className={field} defaultValue="in_person">
            <option value="in_person">In person</option>
            <option value="phone">Phone</option>
            <option value="video">Video</option>
          </select>
        </label>
        <button type="submit" className="min-h-12 rounded-full bg-accent px-5 font-medium text-accent-foreground shadow-md shadow-accent/20 transition hover:brightness-105 sm:col-span-3">
          Create slots
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="py-2">When (IST)</th>
            <th>Where</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="py-2">{formatDate(s.startsAt, "en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
              <td>{s.location}</td>
              <td>{s.status === "booked" ? "Booked" : "Open"}</td>
              <td className="text-right">
                <form action={cancelSlotAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="rounded-full px-3 py-1 text-urgent transition hover:bg-accent-soft">
                    Cancel
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {slots.length === 0 && <p className="text-muted">No upcoming slots. Students will see Tele-MANAS and iCall instead.</p>}
    </>
  );
}
