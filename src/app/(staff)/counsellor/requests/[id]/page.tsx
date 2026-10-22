import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckinDetail } from "@/components/staff/CheckinDetail";
import { linkClass, mutedLinkClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n";
import { isUuid } from "@/lib/services/checkins";
import { getContactRequestForStaff } from "@/lib/services/contactRequests";
import { setRequestStatus } from "../../../actions";

export default async function RequestDetail({ params }: PageProps<"/counsellor/requests/[id]">) {
  const session = await requireStaffPage(["counsellor"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const request = await getContactRequestForStaff(id, session.email!);
  if (!request) notFound();

  const c = request.contact;
  return (
    <>
      <Link href="/counsellor" className={`inline-flex items-center gap-1 text-sm ${mutedLinkClass}`}>
        ← All requests
      </Link>
      <h1 className="font-display text-2xl font-black leading-tight tracking-tight sm:text-3xl">Contact request</h1>
      <p className="text-sm text-muted">
        Received {formatDate(request.createdAt, "en", { dateStyle: "medium", timeStyle: "short" })} IST · status: {request.status}
        {request.handledBy && ` · ${request.handledBy}`}
      </p>

      <section className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="font-semibold">How to reach them</h2>
        {c.name && <p>Name they gave: {c.name}</p>}
        {c.phone && (
          <p>
            Phone:{" "}
            <a className={`font-semibold ${linkClass}`} href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
              {c.phone}
            </a>
          </p>
        )}
        {c.email && (
          <p>
            Email:{" "}
            <a className={linkClass} href={`mailto:${c.email}`}>
              {c.email}
            </a>
          </p>
        )}
        {c.bestTime && <p>Best time: {c.bestTime}</p>}
      </section>

      <form action={setRequestStatus} className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={request.id} />
        {request.status !== "contacted" && (
          <button name="status" value="contacted" className="min-h-12 rounded-md bg-accent px-5 font-medium text-accent-foreground">
            Mark contacted
          </button>
        )}
        {request.status !== "closed" && (
          <button name="status" value="closed" className="min-h-12 rounded-md border border-border px-5 font-medium">
            Close
          </button>
        )}
        {request.status === "closed" && (
          <button name="status" value="new" className="min-h-12 rounded-md border border-border px-5 font-medium">
            Reopen
          </button>
        )}
      </form>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="font-semibold">Shared check-in</h2>
        {request.checkin ? <CheckinDetail checkin={request.checkin} /> : <p className="text-muted">The check-in was deleted.</p>}
      </section>
    </>
  );
}
