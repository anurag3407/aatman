import Link from "next/link";
import { notFound } from "next/navigation";
import { acknowledgeAlertAction, resolveAlertAction } from "@/app/(staff)/actions";
import { requireStaffPage } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n";
import { getAlertForStaff } from "@/lib/services/alerts";
import { isUuid } from "@/lib/services/checkins";
import { TIER_BADGE, TIER_LABELS } from "@/lib/staffLabels";

const IST = { dateStyle: "medium", timeStyle: "short" } as const;

export default async function AlertDetail({ params }: PageProps<"/counsellor/alerts/[id]">) {
  const session = await requireStaffPage(["counsellor"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const alert = await getAlertForStaff(id, session.email!);
  if (!alert) notFound();

  return (
    <>
      <Link
        href="/counsellor/alerts"
        className="w-fit rounded-full text-sm text-muted underline decoration-border underline-offset-4 transition hover:text-foreground"
      >
        ← All alerts
      </Link>

      <header className="flex flex-col gap-2">
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${TIER_BADGE[alert.tier]}`}>
          {TIER_LABELS[alert.tier]}
        </span>
        <h1 className="font-serif text-[1.85rem] font-medium leading-tight tracking-[-0.015em]">Crisis alert</h1>
        <p className="text-sm text-muted">
          {formatDate(alert.createdAt, "en", IST)} IST · status: {alert.status}
          {alert.acknowledgedBy ? ` · acknowledged by ${alert.acknowledgedBy}` : ""}
          {alert.escalationLevel > 0 ? ` · escalation level ${alert.escalationLevel}` : ""}
        </p>
        <p className="text-xs text-muted">Reference {alert.id.slice(0, 8)}</p>
      </header>

      <section className="card-soft flex flex-col gap-2 rounded-[1.4rem] border border-border/75 bg-surface/75 p-4 sm:p-5">
        <h2 className="font-serif text-[1.15rem] font-medium">What to do now</h2>
        <p className="text-sm leading-relaxed">
          This alert carries no answers or identity. If the student shared callback details, open the contact request
          below and follow the escalation SOP. If they did not, they have still been shown 14416 and 112.
        </p>
        {alert.contactRequestId ? (
          <Link
            href={`/counsellor/requests/${alert.contactRequestId}`}
            className="w-fit rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:brightness-105"
          >
            Open callback details
          </Link>
        ) : (
          <p className="text-sm text-muted">
            No callback details shared. The student can send a contact request from their results page.
          </p>
        )}
      </section>

      <form action={acknowledgeAlertAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={alert.id} />
        {alert.status === "open" && (
          <button className="min-h-12 rounded-full bg-accent px-5 font-medium text-accent-foreground transition hover:brightness-105">
            Acknowledge
          </button>
        )}
      </form>

      <form action={resolveAlertAction} className="card-soft flex flex-col gap-3 rounded-[1.4rem] border border-border/75 bg-surface/75 p-4 sm:p-5">
        <input type="hidden" name="id" value={alert.id} />
        <label className="flex flex-col gap-1.5 text-sm">
          Resolution note (optional, encrypted)
          <textarea
            name="note"
            rows={3}
            maxLength={2_000}
            className="rounded-xl border border-border bg-surface px-3 py-2"
            placeholder="What happened, and what was handed over?"
          />
        </label>
        {alert.note && (
          <div className="rounded-xl bg-accent-soft/40 px-3 py-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Previous note</p>
            <p className="mt-1 whitespace-pre-wrap">{alert.note}</p>
          </div>
        )}
        {alert.status !== "resolved" && (
          <button className="min-h-12 rounded-full border border-border bg-surface/70 px-5 font-medium transition hover:border-accent/40 hover:bg-accent-soft/50">
            Resolve
          </button>
        )}
      </form>
    </>
  );
}
