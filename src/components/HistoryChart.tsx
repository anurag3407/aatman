import { formatDate, type Locale } from "@/lib/i18n";

export interface Point {
  at: string;
  mood: number | null;
  worry: number | null;
}

/**
 * Two series on one 0–100% axis (mood /27, worry /21), oldest on the left.
 * The series are told apart by marker shape and dash, not colour alone.
 */
export function HistoryChart({ points, locale, labels }: { points: Point[]; locale: Locale; labels: { mood: string; worry: string } }) {
  const W = 320;
  const H = 160;
  const PAD = { l: 8, r: 8, t: 12, b: 24 };
  const usable = points.filter((p) => p.mood !== null || p.worry !== null);
  if (usable.length < 2) return null;

  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (usable.length - 1);
  const y = (frac: number) => PAD.t + (1 - frac) * (H - PAD.t - PAD.b);
  const series = [
    { key: "mood" as const, max: 27, label: labels.mood, dash: "", marker: "circle" },
    { key: "worry" as const, max: 21, label: labels.worry, dash: "5 4", marker: "square" },
  ];

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${labels.mood}, ${labels.worry}`}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={y(f)} y2={y(f)} stroke="var(--border)" strokeWidth={1} />
        ))}
        {series.map((s) => {
          const pts = usable.flatMap((p, i) => (p[s.key] === null ? [] : [[x(i), y(p[s.key]! / s.max)] as const]));
          return (
            <g key={s.key} stroke="var(--accent)" fill="var(--accent)">
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" strokeWidth={2} strokeDasharray={s.dash} />
              {pts.map(([px, py], i) =>
                s.marker === "circle" ? (
                  <circle key={i} cx={px} cy={py} r={4} />
                ) : (
                  <rect key={i} x={px - 3.5} y={py - 3.5} width={7} height={7} fill="var(--surface)" strokeWidth={2} />
                ),
              )}
            </g>
          );
        })}
        <text x={PAD.l} y={H - 6} fontSize={10} fill="var(--muted)">
          {formatDate(usable[0].at, locale, { day: "numeric", month: "short" })}
        </text>
        <text x={W - PAD.r} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="end">
          {formatDate(usable.at(-1)!.at, locale, { day: "numeric", month: "short" })}
        </text>
      </svg>
      <figcaption className="flex gap-4 text-sm text-muted">
        <span>● {labels.mood}</span>
        <span>▢ {labels.worry}</span>
      </figcaption>
    </figure>
  );
}
