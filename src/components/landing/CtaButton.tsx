import Link from "next/link";

export function CtaButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex min-h-16 w-full max-w-md overflow-hidden font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
      <span className="flex flex-1 items-center justify-center bg-lime px-6 text-center">
        {children}
      </span>
      <span className="flex w-20 items-center justify-center bg-violet text-white">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-7 w-7 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12h18M14 5l7 7-7 7" />
        </svg>
      </span>
    </Link>
  );
}