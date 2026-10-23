import { formatDate } from "@/lib/i18n";
import type { CheckinRecord } from "@/lib/services/checkins";
import { REASON_LABELS, TIER_BADGE, TIER_LABELS } from "@/lib/staffLabels";
import en from "@/messages/en";

const LIKERT = en.checkin.likert;
const yn = (v: boolean | null | undefined) => (v === true ? "Yes" : v === false ? "No" : "Not answered");

/** Full shared check-in for a counsellor, including item-level answers and C-SSRS. */
export function CheckinDetail({ checkin }: { checkin: CheckinRecord }) {
  const { triage, answers, campus } = checkin;
  const s = triage.scores;
  const cssrs = answers.cssrs;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${TIER_BADGE[triage.tier]}`}>{TIER_LABELS[triage.tier]}</span>
        <span className="text-sm text-muted">{formatDate(checkin.createdAt, "en", { dateStyle: "medium", timeStyle: "short" })} IST</span>
      </div>

      {triage.reasons.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {triage.reasons.map((r) => (
            <li key={r}>{REASON_LABELS[r]}</li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Score label="PHQ-9" value={s.phq9.total} max={27} extra={s.phq9.prorated ? "prorated" : undefined} />
        <Score label="GAD-7" value={s.gad7.total} max={21} extra={s.gad7.prorated ? "prorated" : undefined} />
        <Score label="PHQ-2" value={s.phq2.total} max={6} />
        <Score label="GAD-2" value={s.gad2.total} max={6} />
      </dl>

      {cssrs && (
        <section className="rounded-xl border border-urgent p-4 text-sm">
          <h3 className="mb-2 font-semibold">C-SSRS screener (past month) · risk: {s.cssrs ?? "n/a"}</h3>
          <ul className="flex flex-col gap-1">
            <li>Wish to be dead: {yn(cssrs.wishToBeDead)}</li>
            <li>Active suicidal thoughts: {yn(cssrs.activeThoughts)}</li>
            {cssrs.activeThoughts && (
              <>
                <li>Method: {yn(cssrs.method)}</li>
                <li>Intent: {yn(cssrs.intent)}</li>
                <li>Plan with intent: {yn(cssrs.planWithIntent)}</li>
              </>
            )}
            <li>Suicidal behaviour: {cssrs.behavior?.replaceAll("_", " ") ?? "Not answered"}</li>
          </ul>
        </section>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Item-level answers</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
          {answers.phq9.map((v, i) => (
            <li key={`p${i}`}>
              PHQ-9 · {en.checkin.phq9[i]}: <strong>{v === null ? "not asked / skipped" : LIKERT[v]}</strong>
            </li>
          ))}
        </ol>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
          {answers.gad7.map((v, i) => (
            <li key={`g${i}`}>
              GAD-7 · {en.checkin.gad7[i]}: <strong>{v === null ? "not asked / skipped" : LIKERT[v]}</strong>
            </li>
          ))}
        </ol>
        <ul className="mt-2 flex flex-col gap-1">
          <li>Sleep: {campus.sleep === null ? "skipped" : en.checkin.campus["campus.sleep"].options[campus.sleep]}</li>
          <li>Academic pressure: {campus.academics === null ? "skipped" : en.checkin.campus["campus.academics"].options[campus.academics]}</li>
          <li>Confidant / social support: {campus.social == null ? "skipped" : en.checkin.campus["campus.social"].options[campus.social]}</li>
          <li>Substance / coping use: {campus.substances == null ? "skipped" : en.checkin.campus["campus.substances"].options[campus.substances]}</li>
          <li>Felt unsafe / ragged: {campus.safety === null ? "skipped" : en.checkin.campus["campus.safety"].options[campus.safety]}</li>
        </ul>
      </details>
    </div>
  );
}

function Score({ label, value, max, extra }: { label: string; value: number | null; max: number; extra?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-lg font-semibold">
        {value === null ? "–" : `${value}/${max}`} {extra && <span className="text-xs font-normal text-muted">{extra}</span>}
      </dd>
    </div>
  );
}
