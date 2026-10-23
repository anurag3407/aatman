import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckinDetail } from "@/components/staff/CheckinDetail";
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
      <Link href="/counsellor" className="w-fit rounded-full text-sm text-muted underline decoration-border underline-offset-4 transition hover:text-foreground">
        ← Back
      </Link>
      <h1 className="font-serif text-[1.85rem] font-medium leading-tight tracking-[-0.015em]">Booked session</h1>
      <p>
        {formatDate(booking.slot.startsAt, "en", { dateStyle: "full", timeStyle: "short" })} IST · {booking.slot.location} ·{" "}
        {booking.slot.mode.replace("_", " ")}
      </p>
      {booking.phone && (
        <p>
          Phone (for rescheduling):{" "}
          <a className="font-semibold text-accent underline" href={`tel:${booking.phone.replace(/[^\d+]/g, "")}`}>
            {booking.phone}
          </a>
        </p>
      )}
      <section className="card-soft flex flex-col gap-3 rounded-[1.4rem] border border-border/75 bg-surface/75 p-4 sm:p-5">
        <h2 className="font-serif text-[1.15rem] font-medium">Shared check-in</h2>
        {booking.checkin ? (
          <CheckinDetail checkin={booking.checkin} />
        ) : (
          <p className="text-muted">The student chose not to share a check-in for this session.</p>
        )}
      </section>
    </>
  );
}
