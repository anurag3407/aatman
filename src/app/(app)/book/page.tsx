import { BookingView } from "@/components/BookingView";
import { ContactForm } from "@/components/ContactForm";
import { Page, PageTitle } from "@/components/ui";
import { requireStudentPage } from "@/lib/auth/guards";
import { getMessages } from "@/lib/i18n/server";
import { tierRank } from "@/lib/safety/triage";
import { listOpenSlots, listStudentBookings } from "@/lib/services/booking";
import { latestCheckin } from "@/lib/services/checkins";

export default async function BookPage() {
  const session = await requireStudentPage();
  const [{ m }, latest] = await Promise.all([getMessages(), latestCheckin(session.sub)]);
  const includeUrgent = latest ? tierRank(latest.triage.tier) >= tierRank("elevated") : false;
  const [open, mine] = await Promise.all([
    listOpenSlots(new Date(), { includeUrgent }),
    listStudentBookings(session.sub),
  ]);

  const serialize = <T extends { startsAt: Date; endsAt: Date }>(s: T) => ({
    ...s,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
  });

  return (
    <Page>
      <PageTitle eyebrow={m.common.appName} sub={m.book.body}>{m.book.title}</PageTitle>
      <BookingView open={open.map(serialize)} mine={mine.map(serialize)} hasCheckin={latest !== null} />
      {latest && (
        <>
          <h2 className="pt-1 font-serif text-[1.3rem] font-medium">{m.book.contactInstead}</h2>
          <ContactForm checkinId={latest.id} defaultOpen={false} />
        </>
      )}
    </Page>
  );
}
