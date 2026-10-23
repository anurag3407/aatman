import { requireStaffPage } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n";
import { listStaffSlots } from "@/lib/services/booking";
import { getCounsellor } from "@/lib/services/counsellors";
import { cancelSlotAction, createSlotsAction, upsertProfileAction } from "../../actions";

const field = "min-h-11 rounded-xl border border-border/80 bg-surface/70 px-3";

export default async function SlotsPage() {
  const session = await requireStaffPage(["counsellor"]);
  const [slots, profile] = await Promise.all([listStaffSlots(), getCounsellor(session.email!)]);

  return (
    <>
      <h1 className="font-serif text-[1.85rem] font-medium leading-tight tracking-[-0.015em]">Session slots</h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-[1.3rem] font-medium">Your public profile</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Students see this next to your slots, so they can pick a counsellor who speaks their language.
        </p>
        <form action={upsertProfileAction} className="card-soft grid gap-3 rounded-[1.4rem] border border-border/75 bg-surface/75 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Display name
            <input name="displayName" required maxLength={80} defaultValue={profile?.displayName ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Languages
            <input name="languages" maxLength={160} defaultValue={profile?.languages ?? ""} placeholder="Hindi, English, Marathi" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Short bio (optional)
            <textarea name="bio" rows={2} maxLength={600} defaultValue={profile?.bio ?? ""} className="rounded-xl border border-border/80 bg-surface/70 px-3 py-2" />
          </label>
          <button type="submit" className="min-h-12 rounded-full bg-accent px-5 font-medium text-accent-foreground shadow-md shadow-accent/20 transition hover:brightness-105 sm:col-span-2">
            Save profile
          </button>
        </form>
      </section>

      <h2 className="font-serif text-[1.3rem] font-medium">Create slots</h2>
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
        <label className="flex items-center gap-3 rounded-xl border border-border/80 bg-surface/70 px-3 text-sm sm:col-span-2">
          <input type="checkbox" name="isUrgent" className="size-5 accent-[var(--accent)]" />
          Priority slot — hidden from the general list, offered after an elevated or higher check-in
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
              <td>
                {s.status === "booked" ? "Booked" : "Open"}
                {s.isUrgent && <span className="ml-2 rounded-full border border-urgent/40 px-2 py-0.5 text-[0.68rem] font-semibold text-urgent">Priority</span>}
              </td>
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
