import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckinDetail } from "@/components/staff/CheckinDetail";
import { linkClass, mutedLinkClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n";
import { getBookingForStaff } from "@/lib/services/booking";
import { isUuid } from "@/lib/services/checkins";

export default async function BookingDetailPage({ params }: PageProps<"/counsellor/bookings/[id]">) {
  const session = await requireStaffPage(["counsellor"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const booking = await getBookingForStaff(id, session.email!);
  if (!booking) notFound();

  return (
    <>
      <Link href="/counsellor" className={`inline-flex items-center gap-1 text-sm ${mutedLinkClass}`}>
        ← Back
      </Link>
      <h1 className="font-display text-2xl font-black leading-tight tracking-tight sm:text-3xl">Booked session</h1>
      <p>
        {formatDate(booking.slot.startsAt, "en", { dateStyle: "full", timeStyle: "short" })} IST · {booking.slot.location} ·{" "}
        {booking.slot.mode.replace("_", " ")}
      </p>
      {booking.phone && (
        <p>
          Phone (for rescheduling):{" "}
          <a className={`font-semibold ${linkClass}`} href={`tel:${booking.phone.replace(/[^\d+]/g, "")}`}>
            {booking.phone}
          </a>
        </p>
      )}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="font-semibold">Shared check-in</h2>
        {booking.checkin ? (
          <CheckinDetail checkin={booking.checkin} />
        ) : (
          <p className="text-muted">The student chose not to share a check-in for this session.</p>
        )}
      </section>
    </>
  );
}
