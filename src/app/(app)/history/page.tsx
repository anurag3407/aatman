import Link from "next/link";
import { CompanionMark } from "@/components/Companion";
import { HistoryChart } from "@/components/HistoryChart";
import { IconCheckin } from "@/components/icons";
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
      <PageTitle eyebrow={m.common.appName} sub={fmt(m.history.retention, { months: env().RETENTION_MONTHS })}>
        {m.history.title}
      </PageTitle>

      {checkins.length === 0 ? (
        <div className="animate-rise flex flex-col items-center gap-4 rounded-[1.9rem] border border-border/70 bg-surface/55 px-6 py-12 text-center">
          <CompanionMark className="h-20 w-20" />
          <p className="font-serif text-[1.3rem] leading-snug">{m.history.empty}</p>
          <p className="max-w-xs text-sm leading-relaxed text-muted">{m.companion.checkin}</p>
          <LinkButton href="/checkin">{m.home.start}</LinkButton>
        </div>
      ) : (
        <>
          <Card className="animate-rise">
            <h2 className="font-serif text-[1.15rem] font-medium">{m.history.chartTitle}</h2>
            <HistoryChart points={points} locale={locale} labels={{ mood: m.results.scale.phq9, worry: m.results.scale.gad7 }} />
            <p className="text-xs leading-relaxed text-muted">{m.history.chartNote}</p>
          </Card>
          <ul className="stagger flex flex-col gap-2">
            {checkins.map((c) => (
              <li
                key={c.id}
                className="card-soft flex items-center justify-between gap-3 rounded-[1.4rem] border border-border/75 bg-surface/75 px-4 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft/75 text-accent">
                    <IconCheckin className="h-5 w-5" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-serif text-[1.02rem] leading-snug">
                      {formatDate(c.createdAt, locale, { dateStyle: "medium" })}
                    </span>
                    <span className="text-xs text-muted">{m.history.tier[c.triage.tier]}</span>
                  </span>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <KeepToggle id={c.id} initial={c.keep} />
                  <Link
                    href={`/results/${c.id}`}
                    className="rounded-full px-3 py-2 text-sm font-medium text-accent transition duration-300 hover:bg-accent-soft/60"
                  >
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
