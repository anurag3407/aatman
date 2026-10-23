import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckinDetail } from "@/components/staff/CheckinDetail";
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
      <Link href="/counsellor" className="w-fit rounded-full text-sm text-muted underline decoration-border underline-offset-4 transition hover:text-foreground">
        ← All requests
      </Link>
      <h1 className="font-serif text-[1.85rem] font-medium leading-tight tracking-[-0.015em]">Contact request</h1>
      <p className="text-sm text-muted">
        Received {formatDate(request.createdAt, "en", { dateStyle: "medium", timeStyle: "short" })} IST · status: {request.status}
        {request.handledBy && ` · ${request.handledBy}`}
      </p>

      <section className="card-soft flex flex-col gap-1.5 rounded-[1.4rem] border border-border/75 bg-surface/75 p-4">
        <h2 className="font-serif text-[1.15rem] font-medium">How to reach them</h2>
        {c.name && <p>Name they gave: {c.name}</p>}
        {c.phone && (
          <p>
            Phone:{" "}
            <a className="font-semibold text-accent underline" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
              {c.phone}
            </a>
          </p>
        )}
        {c.email && (
          <p>
            Email:{" "}
            <a className="text-accent underline" href={`mailto:${c.email}`}>
              {c.email}
            </a>
          </p>
        )}
        {c.bestTime && <p>Best time: {c.bestTime}</p>}
      </section>

      <form action={setRequestStatus} className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={request.id} />
        {request.status !== "contacted" && (
          <button name="status" value="contacted" className="min-h-12 rounded-full bg-accent px-5 font-medium text-accent-foreground shadow-md shadow-accent/20 transition hover:brightness-105">
            Mark contacted
          </button>
        )}
        {request.status !== "closed" && (
          <button name="status" value="closed" className="min-h-12 rounded-full border border-border bg-surface/70 px-5 font-medium transition hover:border-accent/40 hover:bg-accent-soft/50">
            Close
          </button>
        )}
        {request.status === "closed" && (
          <button name="status" value="new" className="min-h-12 rounded-full border border-border bg-surface/70 px-5 font-medium transition hover:border-accent/40 hover:bg-accent-soft/50">
            Reopen
          </button>
        )}
      </form>

      <section className="card-soft flex flex-col gap-3 rounded-[1.4rem] border border-border/75 bg-surface/75 p-4 sm:p-5">
        <h2 className="font-serif text-[1.15rem] font-medium">Shared check-in</h2>
        {request.checkin ? <CheckinDetail checkin={request.checkin} /> : <p className="text-muted">The check-in was deleted.</p>}
      </section>
    </>
  );
}
