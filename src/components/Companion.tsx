import type { ReactNode } from "react";

/**
 * Aatman's companion: a small breathing seed with a sprout — a quiet presence,
 * not a mascot that talks at you. It is decorative; the copy carries the meaning.
 */
export function CompanionMark({ className = "h-10 w-10", breathing = true }: { className?: string; breathing?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={`${className} ${breathing ? "companion-breathe" : ""}`}
    >
      <defs>
        <radialGradient id="companion-halo" cx="50%" cy="44%" r="52%">
          <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.55" />
          <stop offset="62%" stopColor="var(--glow)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="companion-body" x1="20%" y1="8%" x2="82%" y2="96%">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--surface) 70%, var(--glow))" />
          <stop offset="100%" stopColor="var(--accent-soft)" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="34" r="29" fill="url(#companion-halo)" />

      <path
        d="M32 15.6v-5"
        stroke="var(--accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M32 11.8c-1-3.6-3.8-5.7-7.8-6 .1 4 2.9 6.6 7.8 6.9Z"
        fill="var(--accent-soft)"
        stroke="var(--accent)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M32 10.4c1.4-2.7 3.9-4 7.2-4.2-.3 3.5-2.7 5.6-7.2 6.1Z"
        fill="var(--accent-soft)"
        stroke="var(--accent)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />

      <path
        d="M32 15.6c10.6 0 18 7.6 18 18.6C50 47 42 55 32 55S14 47 14 34.2C14 23.2 21.4 15.6 32 15.6Z"
        fill="url(#companion-body)"
        stroke="var(--accent)"
        strokeOpacity="0.5"
        strokeWidth="1.4"
      />

      <g stroke="var(--foreground)" strokeOpacity="0.8" strokeWidth="1.9" strokeLinecap="round" fill="none">
        <path d="M23.1 32.3c2.3 2.7 4.8 2.7 7.1 0" />
        <path d="M33.8 32.3c2.3 2.7 4.8 2.7 7.1 0" />
        <path d="M28.5 40.1c2.2 2 4.8 2 7 0" />
      </g>

      <circle cx="20.4" cy="38.4" r="2.4" fill="var(--glow)" opacity="0.5" />
      <circle cx="43.6" cy="38.4" r="2.4" fill="var(--glow)" opacity="0.5" />
    </svg>
  );
}

/** A line of company, in the companion's voice. Optionally without the figure. */
export function CompanionNote({
  title,
  body,
  className = "",
  mark = true,
}: {
  title: ReactNode;
  body?: ReactNode;
  className?: string;
  mark?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3.5 rounded-[1.6rem] rounded-tl-lg border border-border/70 bg-surface/70 px-4 py-3.5 pr-5 ${className}`}
    >
      {mark && <CompanionMark className="mt-0.5 h-9 w-9 shrink-0" />}
      <div className="flex flex-col gap-1">
        <p className="font-serif text-[1.08rem] leading-snug text-pretty">{title}</p>
        {body && <p className="text-sm leading-relaxed text-muted">{body}</p>}
      </div>
    </div>
  );
}
