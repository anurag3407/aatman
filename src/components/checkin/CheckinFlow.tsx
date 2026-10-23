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
import { Banner, Button } from "@/components/ui";

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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    const submission = toSubmission(state);

    const finishLocally = (reason: "stateless" | "offline") => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { textDetection, ...publicTriage } = triage(submission.answers);
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
      if (res.status === 401) return router.push("/signin");
      if (res.status === 403) return router.push("/consent");
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      sessionStorage.removeItem(DRAFT_KEY);
      router.push(`/results/${id}`);
    } catch (err) {
      // Offline or server down: results are still computed and shown, just not saved.
      if (err instanceof TypeError) return finishLocally("offline");
      setError(m.common.genericError);
      setSubmitting(false);
    }
  }

  if (!loaded) return <p className="text-muted">{m.common.loading}</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{m.checkin.title}</span>
          <span>{fmt(m.checkin.progress, { done, total })}</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-2 overflow-hidden rounded-full bg-accent-soft"
        >
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        {stateless && <p className="text-xs text-muted">{m.checkin.statelessBadge}</p>}
      </div>

      {safetyItemPositive(state) && <Banner tone="urgent">{m.checkin.inlineSupport}</Banner>}

      {done === 0 && <p className="text-muted">{m.checkin.intro}</p>}

      {step ? (
        <StepView key={step.id} step={step} headingRef={headingRef} onAnswer={respond} />
      ) : (
        <div className="flex flex-col gap-3">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            {m.checkin.submit}
          </h2>
          {error && <Banner tone="urgent">{error}</Banner>}
          <Button onClick={submit} disabled={submitting}>
            {submitting ? m.checkin.submitting : m.checkin.submit}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => setState(back)} disabled={state.order.length === 0 || submitting}>
          ← {m.common.back}
        </Button>
        {step && step.kind !== "freeText" && (
          <Button variant="ghost" onClick={() => respond(step.kind === "deeper" ? false : null)}>
            {m.common.skip}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted">{m.checkin.draftNote}</p>
      {state.order.length > 0 && (
        <button type="button" className="self-start text-xs text-muted underline" onClick={() => setState(EMPTY_FLOW)}>
          {m.checkin.restart}
        </button>
      )}
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
    <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold leading-snug outline-none">
      {content}
    </h2>
  );

  const options = (items: { label: string; value: StepValue }[]) => (
    <div className="flex flex-col gap-2" role="group">
      {items.map((o) => (
        <Button key={String(o.value)} variant="secondary" className="justify-start text-left" onClick={() => onAnswer(o.value)}>
          {o.label}
        </Button>
      ))}
    </div>
  );

  const bubble = (children: React.ReactNode) => (
    <div className="flex flex-col gap-4 rounded-2xl rounded-tl-sm border border-border bg-surface p-5">
      <span className="text-xs font-medium text-accent">{m.common.appName}</span>
      {children}
    </div>
  );

  switch (step.kind) {
    case "likert4": {
      const item = step.scale === "phq9" ? m.checkin.phq9[step.index] : m.checkin.gad7[step.index];
      const sensitive = step.scale === "phq9" && step.index === PHQ9_SAFETY_ITEM_INDEX;
      return bubble(
        <>
          {sensitive && <p className="text-sm text-muted">{m.checkin.sensitiveIntro}</p>}
          <p className="text-sm text-muted">{m.checkin.stem}</p>
          {heading(item)}
          {options(m.checkin.likert.map((label, value) => ({ label, value })))}
        </>,
      );
    }
    case "yesno":
      return bubble(
        <>
          {step.id === "cssrs.wish" && <p className="text-sm text-muted">{m.checkin.cssrsIntro}</p>}
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
          <p className="text-muted">{m.checkin.deeper.body}</p>
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
          <p className="text-sm text-muted">{m.checkin.freeText.hint}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder={m.checkin.freeText.placeholder}
            aria-label={m.checkin.freeText.q}
            className="w-full rounded-xl border border-border bg-background p-4 text-base focus-visible:outline-2 focus-visible:outline-accent"
          />
          <Button onClick={() => onAnswer(text.trim() || null)}>{m.common.continue}</Button>
        </>,
      );
  }
}
