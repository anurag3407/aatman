import Link from "next/link";
import { acknowledgeAlertAction, createOnCallAction } from "@/app/(staff)/actions";
import { requireStaffPage } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/i18n";
import { getAlertRecipients, listOnCallShifts, listOpenAlerts } from "@/lib/services/alerts";
import { TIER_BADGE, TIER_LABELS } from "@/lib/staffLabels";

const IST = { dateStyle: "medium", timeStyle: "short" } as const;

function age(createdAt: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export default async function AlertsPage() {
  const session = await requireStaffPage(["counsellor"]);
  const [alerts, shifts, recipients] = await Promise.all([listOpenAlerts(), listOnCallShifts(), getAlertRecipients()]);
  const now = new Date();
  const emailConfigured = Boolean(env().NOTIFY_WEBHOOK_URL);
  const onCallNow = shifts.some((shift) => shift.startsAt <= now && shift.endsAt > now);

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-[1.85rem] font-medium leading-tight tracking-[-0.015em]">Crisis alerts</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Every crisis or urgent check-in creates an alert here. Open one to see the severity and whether the student
          shared callback details. Answers are never shown here.
        </p>
      </header>

      {recipients.length === 0 && (
        <p className="rounded-[1.1rem] border border-urgent/50 bg-urgent/10 px-4 py-3 text-sm">
          No alert recipients are configured. Add an on-call shift below or set ALERT_EMAILS in the deployment.
        </p>
      )}
      {recipients.length > 0 && !onCallNow && (
        <p className="rounded-[1.1rem] border border-border/80 bg-accent-soft/50 px-4 py-3 text-sm">
          No on-call shift is active. Alerts are going to the fallback list: {recipients.join(", ")}.
        </p>
      )}
      {!emailConfigured && env().NODE_ENV === "production" && (
        <p className="rounded-[1.1rem] border border-urgent/50 bg-urgent/10 px-4 py-3 text-sm">
          Email transport is not configured, so nobody will be paged outside this dashboard. Set NOTIFY_WEBHOOK_URL.
        </p>
      )}

      <section className="flex flex-col gap-2" aria-live="polite">
        {alerts.length === 0 ? (
          <p className="rounded-[1.2rem] border border-border/75 bg-surface/60 px-4 py-5 text-muted">No open alerts.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="card-soft flex flex-col gap-3 rounded-[1.3rem] border border-border/75 bg-surface/75 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TIER_BADGE[alert.tier]}`}>
                    {TIER_LABELS[alert.tier]}
                  </span>
                  <span className="text-sm">{age(alert.createdAt, now)} ago</span>
                  <span className="text-xs text-muted">
                    {formatDate(alert.createdAt, "en", IST)} IST
                  </span>
                  {alert.status === "acknowledged" && (
                    <span className="text-xs text-muted">Acknowledged by {alert.acknowledgedBy}</span>
                  )}
                  {alert.escalationLevel > 0 && (
                    <span className="rounded-full border border-urgent/40 px-2 py-0.5 text-[0.7rem] font-semibold text-urgent">
                      Escalated L{alert.escalationLevel}
                    </span>
                  )}
                  {alert.contactRequestId && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.7rem] font-semibold text-accent">
                      Callback shared
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {alert.status === "open" && (
                    <form action={acknowledgeAlertAction}>
                      <input type="hidden" name="id" value={alert.id} />
                      <button className="min-h-9 rounded-full bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:brightness-105">
                        Acknowledge
                      </button>
                    </form>
                  )}
                  <Link
                    href={`/counsellor/alerts/${alert.id}`}
                    className="min-h-9 rounded-full border border-border bg-surface/70 px-4 py-2 text-sm font-medium transition hover:border-accent/40 hover:bg-accent-soft/50"
                  >
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-serif text-[1.3rem] font-medium">On-call rota</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            Alerts go to the counsellor whose shift covers the moment. If no shift is active, they go to the fallback
            list configured for the deployment.
          </p>
        </div>

        {shifts.length === 0 ? (
          <p className="text-sm text-muted">No upcoming shifts. Alerts will use the fallback list.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shifts.map((shift) => (
              <li
                key={shift.id}
                className="flex flex-col gap-1 rounded-[1.1rem] border border-border/70 bg-surface/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  {formatDate(shift.startsAt, "en", IST)} → {formatDate(shift.endsAt, "en", IST)} IST
                </span>
                <span className="text-muted">
                  {shift.staffEmail} · {shift.role === "clinical_lead" ? "Clinical lead" : "Counsellor"}
                  {shift.backupEmail ? ` · backup ${shift.backupEmail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form action={createOnCallAction} className="card-soft grid gap-3 rounded-[1.4rem] border border-border/75 bg-surface/75 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Staff email
            <input
              name="staffEmail"
              type="email"
              required
              defaultValue={session.email}
              className="min-h-11 rounded-xl border border-border bg-surface px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Role
            <select name="role" className="min-h-11 rounded-xl border border-border bg-surface px-3">
              <option value="counsellor">Counsellor</option>
              <option value="clinical_lead">Clinical lead</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Starts (IST)
            <input name="start" type="datetime-local" required className="min-h-11 rounded-xl border border-border bg-surface px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Ends (IST)
            <input name="end" type="datetime-local" required className="min-h-11 rounded-xl border border-border bg-surface px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Backup email (optional)
            <input name="backupEmail" type="email" className="min-h-11 rounded-xl border border-border bg-surface px-3" />
          </label>
          <button className="min-h-11 rounded-full bg-accent px-5 font-medium text-accent-foreground transition hover:brightness-105 sm:col-span-2">
            Add shift
          </button>
        </form>
      </section>
    </>
  );
}
