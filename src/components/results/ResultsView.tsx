"use client";

import { useEffect, useState } from "react";
import type { CampusAnswers } from "@/lib/checkin/flow";
import { formatDate, type Messages } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { ANTI_RAGGING } from "@/lib/safety/helplines";
import { tierRank } from "@/lib/safety/triage";
import type { PublicTriage } from "@/lib/services/checkins";
import { CompanionMark } from "@/components/Companion";
import { IconArrowRight, IconCalendar } from "@/components/icons";
import { ContactForm } from "@/components/ContactForm";
import { CrisisActions } from "@/components/CrisisActions";
import { Banner, Card, LinkButton, SectionLabel } from "@/components/ui";

interface Summary {
  text: string;
  source: "llm" | "template";
}

const TIER_GLOW: Record<string, string> = {
  crisis: "bg-urgent/15",
  urgent: "bg-urgent/12",
  elevated: "bg-glow/25",
  moderate: "bg-glow/20",
  mild: "bg-accent/15",
};

/**
 * Layout follows the tier: urgent and crisis put one-tap calls first; moderate and up
 * lead with a person (counsellor booking / contact); mild leads with self-care.
 */
export function ResultsView({
  mode,
  checkinId,
  createdAt,
  triage,
  campus,
  initialSummary,
}: {
  mode: "saved" | "stateless" | "offline";
  checkinId?: string;
  createdAt: string;
  triage: PublicTriage;
  campus: CampusAnswers;
  initialSummary: Summary | null;
}) {
  const { m, locale } = useI18n();
  const tier = triage.tier;
  const saved = mode === "saved";
  const [summary, setSummary] = useState<Summary | null>(initialSummary ?? (saved ? null : { text: m.templates[tier], source: "template" }));

  useEffect(() => {
    if (summary || !saved || !checkinId) return;
    let cancelled = false;
    fetch(`/api/checkins/${checkinId}/summary`, { method: "POST" })
      .then((r) => (r.ok ? (r.json() as Promise<Summary>) : Promise.reject(r.status)))
      .then((s) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setSummary({ text: m.templates[tier], source: "template" }));
    return () => {
      cancelled = true;
    };
  }, [summary, saved, checkinId, m, tier]);

  const atLeast = (t: Parameters<typeof tierRank>[0]) => tierRank(tier) >= tierRank(t);
  const showRagging = triage.ragging || campus.safety === "yes";
  const date = formatDate(createdAt, locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="relative flex flex-col gap-5">
      <div aria-hidden className={`pointer-events-none absolute -top-20 right-0 size-60 rounded-full blur-3xl ${TIER_GLOW[tier]}`} />

      <header className="animate-rise flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>{m.results.title}</SectionLabel>
          <span className="text-xs text-muted">{date}</span>
        </div>
        <div className="flex items-start gap-3.5">
          <CompanionMark className="mt-1.5 h-11 w-11 shrink-0" />
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-[1.85rem] font-medium leading-[1.18] tracking-[-0.015em] text-balance sm:text-[2.05rem]">
              {m.results.heading[tier]}
            </h1>
            <p className="text-sm leading-relaxed text-muted">{m.companion.resultsSub}</p>
          </div>
        </div>
      </header>

      {mode === "offline" && <Banner>{m.results.notSaved}</Banner>}
      {mode === "stateless" && <Banner>{m.results.stateless}</Banner>}

      {(tier === "crisis" || tier === "urgent") && <CrisisActions m={m} tone={tier} />}
      {tier === "elevated" && <Banner tone="urgent">{m.checkin.inlineSupport}</Banner>}

      <Card aria-live="polite" className="animate-rise">
        <div className="flex items-center gap-2.5">
          <CompanionMark className="h-8 w-8" breathing={false} />
          <h2 className="font-serif text-[1.15rem] font-medium">{m.results.summaryTitle}</h2>
        </div>
        {summary ? (
          <>
            <p className="text-[0.98rem] leading-relaxed">{summary.text}</p>
            {summary.source === "llm" && <p className="text-xs text-muted">{m.results.aiNote}</p>}
          </>
        ) : (
          <p className="flex items-center gap-2 text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            {m.results.summaryLoading}
          </p>
        )}
      </Card>

      {showRagging && (
        <Card>
          <h2 className="font-serif text-[1.15rem] font-medium">{m.results.ragging.title}</h2>
          <p className="text-sm text-muted">{m.results.ragging.body}</p>
          <a href={`tel:${ANTI_RAGGING.tel}`} className="font-semibold text-accent underline underline-offset-4">
            {ANTI_RAGGING.name[locale]} · {ANTI_RAGGING.number}
          </a>
        </Card>
      )}

      <h2 className="pt-1 font-serif text-[1.3rem] font-medium">{m.results.nextTitle}</h2>

      {atLeast("moderate") &&
        (saved ? (
          <>
            {atLeast("elevated") && <ContactForm checkinId={checkinId} />}
            <ActionCard title={m.results.book.title} body={m.results.book.body} href="/book" cta={m.results.book.cta} primary={!atLeast("elevated")} />
            {tier === "moderate" && <ContactForm checkinId={checkinId} defaultOpen={false} />}
          </>
        ) : (
          <Banner>{m.results.contact.stateless}</Banner>
        ))}

      {tier !== "crisis" && <Tips m={m} campus={campus} />}

      <ActionCard
        title={m.results.exercises.title}
        body={m.results.exercises.body}
        href="/exercises"
        cta={m.results.exercises.cta}
        primary={tier === "mild"}
      />
      {saved && !atLeast("elevated") && (
        <ActionCard title={m.results.chat.title} body={m.results.chat.body} href="/chat" cta={m.results.chat.cta} />
      )}

      {tier !== "crisis" && (
        <Card>
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft/80 text-accent">
              <IconCalendar className="h-4 w-4" />
            </span>
            <h2 className="font-serif text-[1.05rem] font-medium">{m.results.recheck.title}</h2>
          </div>
          <p className="text-sm text-muted">{m.results.recheck.body}</p>
          <a href="/api/reminder?days=14" className="text-sm font-medium text-accent underline underline-offset-4" download>
            {m.results.recheck.ics}
          </a>
        </Card>
      )}

      <ScoreDetails m={m} triage={triage} />

      <div className="flex flex-col gap-2 pt-1">
        <LinkButton href={saved ? "/checkin" : "/checkin?mode=stateless"} variant="secondary" className="w-full">
          {m.results.newCheckin}
        </LinkButton>
        {saved && (
          <LinkButton href="/history" variant="ghost" className="w-full">
            {m.results.viewHistory}
          </LinkButton>
        )}
      </div>
    </div>
  );
}

function ActionCard({ title, body, href, cta, primary }: { title: string; body: string; href: string; cta: string; primary?: boolean }) {
  return (
    <Card className="animate-rise gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-[1.15rem] font-medium leading-snug">{title}</h3>
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft/70 text-accent">
          <IconArrowRight className="h-4 w-4" />
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
      <LinkButton href={href} variant={primary ? "primary" : "secondary"} className="mt-1 w-full sm:w-auto">
        {cta}
      </LinkButton>
    </Card>
  );
}

function Tips({ m, campus }: { m: Messages; campus: CampusAnswers }) {
  const tips = [
    ...((campus.sleep ?? 0) >= 2 ? [m.results.tips.sleep] : []),
    ...((campus.academics ?? 0) >= 2 ? [m.results.tips.academics] : []),
    ...((campus.social ?? 0) >= 2 ? [m.results.tips.social] : []),
    ...((campus.substances ?? 0) >= 2 ? [m.results.tips.substances] : []),
  ];
  if (!tips.length) return null;
  return (
    <Card className="gap-4">
      {tips.map((t) => (
        <p key={t} className="flex gap-3 text-sm leading-relaxed">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
          <span>{t}</span>
        </p>
      ))}
    </Card>
  );
}

function ScoreDetails({ m, triage }: { m: Messages; triage: PublicTriage }) {
  const { phq9, gad7, phq2, gad2 } = triage.scores;
  const rows: { label: string; level: string; score: string }[] = [];
  if (phq9.total !== null && phq9.band) rows.push({ label: m.results.scale.phq9, level: m.results.level[phq9.band], score: `${phq9.total}/27` });
  else rows.push({ label: m.results.scale.phq2, level: phq2.band ? m.results.level[phq2.band] : m.results.level.incomplete, score: phq2.total !== null ? `${phq2.total}/6` : "–" });
  if (gad7.total !== null && gad7.band) rows.push({ label: m.results.scale.gad7, level: m.results.level[gad7.band], score: `${gad7.total}/21` });
  else rows.push({ label: m.results.scale.gad2, level: gad2.band ? m.results.level[gad2.band] : m.results.level.incomplete, score: gad2.total !== null ? `${gad2.total}/6` : "–" });

  return (
    <details className="group rounded-[1.5rem] border border-border/70 bg-surface/55 px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-muted transition hover:text-foreground">
        {m.results.details}
        <span aria-hidden className="text-lg leading-none text-muted transition duration-300 group-open:rotate-45">
          +
        </span>
      </summary>
      <dl className="mt-3 flex flex-col">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4 border-t border-border/60 py-2.5 first:border-0">
            <dt className="text-sm">{r.label}</dt>
            <dd className="text-right text-sm">
              {r.level} <span className="text-muted">({r.score})</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-muted">{m.results.detailsNote}</p>
    </details>
  );
}
