import Link from "next/link";
import { HistoryChart } from "@/components/HistoryChart";
import { KeepToggle } from "@/components/KeepToggle";
import { Card, LinkButton, Page, PageTitle } from "@/components/ui";
import { requireStudentPage } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { fmt, formatDate } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/server";
import { listCheckins } from "@/lib/services/checkins";

export default async function HistoryPage() {
  const session = await requireStudentPage();
  const [{ m, locale }, checkins] = await Promise.all([getMessages(), listCheckins(session.sub)]);

  const points = [...checkins].reverse().map((c) => ({
    at: c.createdAt.toISOString(),
    mood: c.triage.scores.phq9.total,
    worry: c.triage.scores.gad7.total,
  }));

  return (
    <Page>
      <PageTitle sub={fmt(m.history.retention, { months: env().RETENTION_MONTHS })}>{m.history.title}</PageTitle>

      {checkins.length === 0 ? (
        <>
          <p className="text-muted">{m.history.empty}</p>
          <LinkButton href="/checkin">{m.home.start}</LinkButton>
        </>
      ) : (
        <>
          <Card>
            <h2 className="font-semibold">{m.history.chartTitle}</h2>
            <HistoryChart points={points} locale={locale} labels={{ mood: m.results.scale.phq9, worry: m.results.scale.gad7 }} />
            <p className="text-xs text-muted">{m.history.chartNote}</p>
          </Card>
          <ul className="flex flex-col gap-2">
            {checkins.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-3">
                <span className="flex flex-col">
                  <span className="font-medium">{formatDate(c.createdAt, locale, { dateStyle: "medium" })}</span>
                  <span className="text-sm text-muted">{m.history.tier[c.triage.tier]}</span>
                </span>
                <span className="flex items-center gap-1">
                  <KeepToggle id={c.id} initial={c.keep} />
                  <Link href={`/results/${c.id}`} className="rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft">
                    {m.history.view}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
