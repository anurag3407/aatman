"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  answer,
  back,
  currentStep,
  EMPTY_FLOW,
  progress,
  safetyItemPositive,
  toSubmission,
  type FlowState,
  type Step,
  type StepValue,
} from "@/lib/checkin/flow";
import { DRAFT_KEY, saveLocalResult } from "@/lib/checkin/localResult";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { PHQ9_SAFETY_ITEM_INDEX } from "@/lib/scales";
import { triage } from "@/lib/safety/triage";
import { CompanionMark, CompanionNote } from "@/components/Companion";
import { Banner, Button, Choice, SectionLabel, textareaClass } from "@/components/ui";

function loadDraft(): FlowState {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as FlowState) : EMPTY_FLOW;
  } catch {
    return EMPTY_FLOW;
  }
}

function saveDraft(state: FlowState) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    // Draft persistence is a convenience only.
  }
}

export function CheckinFlow({ stateless }: { stateless: boolean }) {
  const { m, locale } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<FlowState>(EMPTY_FLOW);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Reading sessionStorage after mount keeps server and client HTML identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loadDraft());
    setLoaded(true);
  }, []);

  const step = currentStep(state);
  const { done, total } = progress(state);

  useEffect(() => {
    if (loaded) saveDraft(state);
    headingRef.current?.focus();
  }, [state, loaded]);

  const respond = (value: StepValue) => step && setState((s) => answer(s, step.id, value));

  async function submit() {
    setSubmitting(true);
    const submission = toSubmission(state);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { textDetection, ...publicTriage } = triage(submission.answers);
    const highRisk = publicTriage.tier === "urgent" || publicTriage.tier === "crisis";

    const finishLocally = (reason: "stateless" | "offline") => {
      saveLocalResult({ triage: publicTriage, campus: submission.campus, createdAt: new Date().toISOString(), reason });
      sessionStorage.removeItem(DRAFT_KEY);
      router.push("/results/local");
    };

    if (stateless) return finishLocally("stateless");

    try {
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...submission, locale }),
      });
      // An expired session must never stand between a high-risk student and the helplines.
      if ((res.status === 401 || res.status === 403) && highRisk) return finishLocally("offline");
      if (res.status === 401) return router.push("/signin");
      if (res.status === 403) return router.push("/consent");
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      sessionStorage.removeItem(DRAFT_KEY);
      router.push(`/results/${id}`);
    } catch {
      // Offline, rate-limited or server error: results are still computed and shown, just not saved.
      finishLocally("offline");
    }
  }

  if (!loaded) return <p className="text-muted">{m.common.loading}</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <SectionLabel>{m.checkin.title}</SectionLabel>
          <span className="text-xs tabular-nums text-muted">{fmt(m.checkin.progress, { done, total })}</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-[5px] overflow-hidden rounded-full bg-accent-soft/85"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent/60 via-accent to-accent transition-[width] duration-700 ease-out"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        {stateless && <p className="text-xs text-muted">{m.checkin.statelessBadge}</p>}
      </div>

      {safetyItemPositive(state) && <Banner tone="urgent">{m.checkin.inlineSupport}</Banner>}

      {done === 0 && (
        <CompanionNote title={m.companion.checkin} body={m.companion.checkinSub} className="animate-rise" />
      )}

      {done === 0 && <p className="px-1 text-sm leading-relaxed text-muted">{m.checkin.intro}</p>}

      {step ? (
        <StepView key={step.id} step={step} headingRef={headingRef} onAnswer={respond} />
      ) : (
        <div className="animate-rise flex flex-col gap-4">
          <CompanionNote title={m.companion.here} body={m.companion.hereSub} />
          <div className="flex flex-col gap-3 px-1">
            <h2 ref={headingRef} tabIndex={-1} className="font-serif text-[1.6rem] font-medium leading-snug outline-none">
              {m.checkin.submit}
            </h2>
            <Button onClick={submit} disabled={submitting} className="w-full">
              {submitting ? m.checkin.submitting : m.checkin.submit}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <Button variant="ghost" onClick={() => setState(back)} disabled={state.order.length === 0 || submitting}>
          ← {m.common.back}
        </Button>
        {step && step.kind !== "freeText" && (
          <Button variant="ghost" onClick={() => respond(step.kind === "deeper" ? false : null)}>
            {m.common.skip}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 px-1">
        <p className="text-xs leading-relaxed text-muted">{m.checkin.draftNote}</p>
        {state.order.length > 0 && (
          <button
            type="button"
            className="self-start text-xs text-muted underline decoration-border underline-offset-4 transition hover:text-foreground"
            onClick={() => setState(EMPTY_FLOW)}
          >
            {m.checkin.restart}
          </button>
        )}
      </div>
    </div>
  );
}

function StepView({
  step,
  headingRef,
  onAnswer,
}: {
  step: Step;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onAnswer: (v: StepValue) => void;
}) {
  const { m } = useI18n();
  const [text, setText] = useState("");

  const heading = (content: React.ReactNode) => (
    <h2
      ref={headingRef}
      tabIndex={-1}
      className="font-serif text-[1.35rem] font-medium leading-snug tracking-[-0.01em] outline-none text-pretty sm:text-[1.45rem]"
    >
      {content}
    </h2>
  );

  const options = (items: { label: string; value: StepValue }[]) => (
    <div className="flex flex-col gap-2" role="group">
      {items.map((o) => (
        <Choice key={String(o.value)} onClick={() => onAnswer(o.value)}>
          {o.label}
        </Choice>
      ))}
    </div>
  );

  const bubble = (children: React.ReactNode) => (
    <div className="animate-rise card-soft flex flex-col gap-4 rounded-[1.8rem] rounded-tl-lg border border-border/75 bg-surface/85 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft/80">
          <CompanionMark className="h-6 w-6" breathing={false} />
        </span>
        <span className="font-serif text-sm text-muted">{m.common.appName}</span>
      </div>
      {children}
    </div>
  );

  switch (step.kind) {
    case "likert4": {
      const item = step.scale === "phq9" ? m.checkin.phq9[step.index] : m.checkin.gad7[step.index];
      const sensitive = step.scale === "phq9" && step.index === PHQ9_SAFETY_ITEM_INDEX;
      return bubble(
        <>
          {sensitive && <p className="text-sm leading-relaxed text-muted">{m.checkin.sensitiveIntro}</p>}
          <p className="text-[0.72rem] uppercase tracking-[0.13em] text-muted">{m.checkin.stem}</p>
          {heading(item)}
          {options(m.checkin.likert.map((label, value) => ({ label, value })))}
        </>,
      );
    }
    case "yesno":
      return bubble(
        <>
          {step.id === "cssrs.wish" && <p className="text-sm leading-relaxed text-muted">{m.checkin.cssrsIntro}</p>}
          {heading(m.checkin.cssrs[step.id])}
          {options([
            { label: m.common.yes, value: true },
            { label: m.common.no, value: false },
          ])}
        </>,
      );
    case "campus": {
      if (step.id === "campus.safety") {
        const c = m.checkin.campus["campus.safety"];
        return bubble(
          <>
            {heading(c.q)}
            {options([
              { label: c.options.no, value: "no" },
              { label: c.options.yes, value: "yes" },
              { label: c.options.prefer_not, value: "prefer_not" },
            ])}
          </>,
        );
      }
      const c = m.checkin.campus[step.id];
      return bubble(
        <>
          {heading(c.q)}
          {options(c.options.map((label, value) => ({ label, value })))}
        </>,
      );
    }
    case "deeper":
      return bubble(
        <>
          {heading(m.checkin.deeper.title)}
          <p className="text-sm leading-relaxed text-muted">{m.checkin.deeper.body}</p>
          {options([
            { label: m.checkin.deeper.yes, value: true },
            { label: m.checkin.deeper.no, value: false },
          ])}
        </>,
      );
    case "freeText":
      return bubble(
        <>
          {heading(m.checkin.freeText.q)}
          <p className="text-sm leading-relaxed text-muted">{m.checkin.freeText.hint}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder={m.checkin.freeText.placeholder}
            aria-label={m.checkin.freeText.q}
            className={textareaClass}
          />
          <Button onClick={() => onAnswer(text.trim() || null)}>{m.common.continue}</Button>
        </>,
      );
  }
}
