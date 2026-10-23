"use client";

import { useEffect, useState } from "react";
import type { CampusAnswers } from "@/lib/checkin/flow";
import { formatDate, type Messages } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { ANTI_RAGGING } from "@/lib/safety/helplines";
import { tierRank } from "@/lib/safety/triage";
import type { PublicTriage } from "@/lib/services/checkins";
import { ContactForm } from "@/components/ContactForm";
import { CrisisActions } from "@/components/CrisisActions";
import { Banner, Card, LinkButton } from "@/components/ui";

interface Summary {
  text: string;
  source: "llm" | "template";
}

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
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          {m.results.title} · {date}
        </p>
        <h1 className="text-2xl font-semibold leading-snug">{m.results.heading[tier]}</h1>
      </header>

      {mode === "offline" && <Banner>{m.results.notSaved}</Banner>}
      {mode === "stateless" && <Banner>{m.results.stateless}</Banner>}

      {(tier === "crisis" || tier === "urgent") && <CrisisActions m={m} tone={tier} />}
      {tier === "elevated" && <Banner tone="urgent">{m.checkin.inlineSupport}</Banner>}

      <Card aria-live="polite">
        <h2 className="font-semibold">{m.results.summaryTitle}</h2>
        {summary ? (
          <>
            <p className="leading-relaxed">{summary.text}</p>
            {summary.source === "llm" && <p className="text-xs text-muted">{m.results.aiNote}</p>}
          </>
        ) : (
          <p className="text-muted">{m.results.summaryLoading}</p>
        )}
      </Card>

      {showRagging && (
        <Card>
          <h2 className="font-semibold">{m.results.ragging.title}</h2>
          <p className="text-sm text-muted">{m.results.ragging.body}</p>
          <a href={`tel:${ANTI_RAGGING.tel}`} className="font-semibold text-accent underline underline-offset-4">
            {ANTI_RAGGING.name[locale]} · {ANTI_RAGGING.number}
          </a>
        </Card>
      )}

      <h2 className="text-lg font-semibold">{m.results.nextTitle}</h2>

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
          <h2 className="font-semibold">{m.results.recheck.title}</h2>
          <p className="text-sm text-muted">{m.results.recheck.body}</p>
          <a href="/api/reminder?days=14" className="text-sm font-medium text-accent underline underline-offset-4" download>
            {m.results.recheck.ics}
          </a>
        </Card>
      )}

      <ScoreDetails m={m} triage={triage} />

      <div className="flex flex-col gap-2">
        <LinkButton href={saved ? "/checkin" : "/checkin?mode=stateless"} variant="secondary">
          {m.results.newCheckin}
        </LinkButton>
        {saved && (
          <LinkButton href="/history" variant="ghost">
            {m.results.viewHistory}
          </LinkButton>
        )}
      </div>
    </div>
  );
}

function ActionCard({ title, body, href, cta, primary }: { title: string; body: string; href: string; cta: string; primary?: boolean }) {
  return (
    <Card>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted">{body}</p>
      <LinkButton href={href} variant={primary ? "primary" : "secondary"}>
        {cta}
      </LinkButton>
    </Card>
  );
}

function Tips({ m, campus }: { m: Messages; campus: CampusAnswers }) {
  const tips = [
    ...((campus.sleep ?? 0) >= 2 ? [m.results.tips.sleep] : []),
    ...((campus.academics ?? 0) >= 2 ? [m.results.tips.academics] : []),
  ];
  if (!tips.length) return null;
  return (
    <Card>
      {tips.map((t) => (
        <p key={t} className="text-sm leading-relaxed">
          {t}
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
    <details className="rounded-2xl border border-border bg-surface p-5">
      <summary className="cursor-pointer font-medium">{m.results.details}</summary>
      <dl className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <dt>{r.label}</dt>
            <dd className="text-right">
              {r.level} <span className="text-muted">({r.score})</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">{m.results.detailsNote}</p>
    </details>
  );
}
