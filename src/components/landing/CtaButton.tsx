import Link from "next/link";
import type { ReactNode } from "react";

/** The large split lime/violet call to action from the landing design. */
export function CtaButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex min-h-16 w-full max-w-md overflow-hidden rounded-md font-semibold text-ink transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
    >
      <span className="flex flex-1 items-center justify-center bg-lime px-6 text-center text-base md:text-lg">{children}</span>
      <span aria-hidden="true" className="flex w-16 items-center justify-center bg-violet text-white md:w-20">
        <svg
          viewBox="0 0 24 24"
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
