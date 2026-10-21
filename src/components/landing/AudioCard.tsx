import { Sparkle } from "./Sparkle";

// Scalloped badge outline, computed once with fixed rounding so server and client match.
const scallop = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    const r = 44 + 3.2 * Math.cos(16 * t);
    pts.push(`${(50 + r * Math.cos(t)).toFixed(2)},${(50 + r * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
})();

const bars = [8, 14, 22, 12, 30, 18, 26, 10, 34, 20, 28, 14, 24, 9, 32, 16, 22, 12, 28, 18, 10, 26, 14, 20, 8, 24, 16, 30, 12, 22];

export function AudioCard() {
  return (
    <div aria-hidden="true" className="flex items-center">
      <div className="relative z-10 h-32 w-32 shrink-0">
        <svg viewBox="0 0 100 100" className="absolute inset-0">
          <path d={scallop} className="fill-lime" />
          <circle cx="50" cy="50" r="31" className="fill-violet" />
        </svg>
        <svg viewBox="0 0 100 100" className="animate-spin-slow absolute inset-0">
          <path id="badge-ring" d="M50,50 m-24,0 a24,24 0 1,1 48,0 a24,24 0 1,1 -48,0" fill="none" />
          <text fontSize="6" fill="#fff" letterSpacing="1">
            <textPath href="#badge-ring" textLength="145" lengthAdjust="spacing">
              breathe in · breathe out · take a moment ·
            </textPath>
          </text>
        </svg>
        <Sparkle className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white" />
      </div>

      <div className="-ml-6 flex h-20 items-center gap-0.75 rounded-full bg-white/10 pl-10 pr-8">
        {bars.map((h, i) => (
          <span
            key={i}
            style={{ height: `${h * 2.2}%` }}
            className={`w-0.75 rounded-full ${i < 14 ? "bg-violet" : "bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}