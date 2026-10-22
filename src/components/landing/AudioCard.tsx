import Link from "next/link";

/** Scalloped badge outline, computed once so server and client render the same path. */
const scallop = (() => {
  const points: string[] = [];
  for (let i = 0; i <= 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    const r = 44 + 3.2 * Math.cos(16 * t);
    points.push(`${(50 + r * Math.cos(t)).toFixed(2)},${(50 + r * Math.sin(t)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
})();

const bars = [8, 14, 22, 12, 30, 18, 26, 10, 34, 20, 28, 14, 24, 9, 32, 16, 22, 12, 28, 18, 10, 26, 14, 20, 8, 24, 16, 30];

/** Decorative recording badge that links to the breathing exercise, so the play icon is real. */
export function AudioCard({ label, badge }: { label: string; badge: string }) {
  return (
    <Link
      href="/exercises/breathing"
      aria-label={label}
      className="group flex w-fit max-w-full items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-lime"
    >
      <div className="relative z-10 h-28 w-28 shrink-0 md:h-32 md:w-32">
        <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0">
          <path d={scallop} className="fill-lime" />
          <circle cx="50" cy="50" r="38" className="fill-violet" />
          <circle cx="50" cy="50" r="27" className="fill-white" />
          <path d="M44 37 L65 50 L44 63 Z" className="fill-violet" />
        </svg>
        <svg viewBox="0 0 100 100" aria-hidden="true" className="animate-spin-slow absolute inset-0">
          <path id="badge-ring" d="M50,50 m-32.5,0 a32.5,32.5 0 1,1 65,0 a32.5,32.5 0 1,1 -65,0" fill="none" />
          <text fontSize="5" fill="#fff" letterSpacing="0.5">
            <textPath href="#badge-ring" textLength="195" lengthAdjust="spacingAndGlyphs">
              {badge}
            </textPath>
          </text>
        </svg>
      </div>

      <div className="-ml-6 flex h-16 items-center gap-[2px] rounded-md bg-white/10 pl-9 pr-5 md:h-20 md:pr-7">
        {bars.map((height, i) => (
          <span
            key={i}
            aria-hidden="true"
            style={{ height: `${height * 2.2}%` }}
            className={`w-[3px] rounded-full ${i < 14 ? "bg-violet" : "bg-white/40"}`}
          />
        ))}
      </div>
    </Link>
  );
}
