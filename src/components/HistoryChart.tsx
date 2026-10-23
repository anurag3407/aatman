import { formatDate, type Locale } from "@/lib/i18n";

export interface Point {
  at: string;
  mood: number | null;
  worry: number | null;
}

type XY = [number, number];

function smoothPath(points: XY[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/**
 * Two series on one 0–100% axis (mood /27, worry /21), oldest on the left.
 * The series are told apart by marker shape and dash, not colour alone.
 */
export function HistoryChart({ points, locale, labels }: { points: Point[]; locale: Locale; labels: { mood: string; worry: string } }) {
  const W = 320;
  const H = 168;
  const PAD = { l: 6, r: 6, t: 14, b: 26 };
  const usable = points.filter((p) => p.mood !== null || p.worry !== null);
  if (usable.length < 2) return null;

  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (usable.length - 1);
  const y = (frac: number) => PAD.t + (1 - frac) * (H - PAD.t - PAD.b);
  const base = y(0);
  const series = [
    { key: "mood" as const, max: 27, label: labels.mood, dash: "", marker: "circle", color: "var(--accent)", area: true },
    { key: "worry" as const, max: 21, label: labels.worry, dash: "5 4", marker: "square", color: "var(--lilac)", area: false },
  ];

  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`${labels.mood}, ${labels.worry}`}>
        <defs>
          <linearGradient id="history-mood-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(f)}
            y2={y(f)}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray={f === 0 ? undefined : "2 5"}
          />
        ))}

        {series.map((s) => {
          const pts: XY[] = usable.flatMap((p, i) => (p[s.key] === null ? [] : [[x(i), y(p[s.key]! / s.max)] as XY]));
          if (pts.length === 0) return null;
          const line = smoothPath(pts);
          const area = `${line} L ${pts[pts.length - 1][0]} ${base} L ${pts[0][0]} ${base} Z`;
          return (
            <g key={s.key}>
              {s.area && <path d={area} fill="url(#history-mood-fill)" stroke="none" />}
              <path
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={s.dash || undefined}
              />
              {pts.map(([px, py], i) =>
                s.marker === "circle" ? (
                  <circle key={i} cx={px} cy={py} r={3.6} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />
                ) : (
                  <rect key={i} x={px - 3} y={py - 3} width={6} height={6} rx={1.2} fill="var(--surface)" stroke={s.color} strokeWidth={2} />
                ),
              )}
            </g>
          );
        })}

        <text x={PAD.l} y={H - 6} fontSize={9.5} fill="var(--muted)">
          {formatDate(usable[0].at, locale, { day: "numeric", month: "short" })}
        </text>
        <text x={W - PAD.r} y={H - 6} fontSize={9.5} fill="var(--muted)" textAnchor="end">
          {formatDate(usable.at(-1)!.at, locale, { day: "numeric", month: "short" })}
        </text>
      </svg>
      <figcaption className="flex gap-4 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-accent" /> {labels.mood}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[1px] border-2 border-lilac" /> {labels.worry}
        </span>
      </figcaption>
    </figure>
  );
}
