type SmileyProps = { fill?: string; className?: string };

/** Decorative face that replaces an "O" in the headline. */
export function Smiley({ fill = "#6d4fe0", className = "" }: SmileyProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={`inline-block h-[0.82em] w-[0.82em] align-[-0.06em] ${className}`}
    >
      <circle cx="50" cy="50" r="46" style={{ fill }} stroke="#fff" strokeWidth="8" />
      <ellipse cx="36" cy="40" rx="5" ry="8" fill="#1a1a1a" />
      <ellipse cx="64" cy="40" rx="5" ry="8" fill="#1a1a1a" />
      <path d="M28 58 Q50 80 72 58" fill="none" stroke="#1a1a1a" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
