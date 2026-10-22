import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Small, accessible building blocks. Large tap targets (≥ 48px) throughout. */

type Variant = "primary" | "secondary" | "ghost" | "urgent";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "border border-border bg-surface text-foreground hover:bg-accent-soft",
  ghost: "text-foreground hover:bg-accent-soft",
  urgent: "bg-urgent text-urgent-foreground hover:opacity-90",
};

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-base font-medium transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

/** Inline links: no permanent underline; colour carries the affordance, with underline on hover. */
export const linkClass =
  "text-accent underline-offset-4 transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Secondary/back links: quieter by default, clearer on hover. */
export const mutedLinkClass =
  "text-muted underline-offset-4 transition hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", children, ...props }: ComponentProps<"section">) {
  return (
    <section className={`flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6 ${className}`} {...props}>
      {children}
    </section>
  );
}

export function Banner({ tone = "info", children, className = "" }: { tone?: "info" | "urgent"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-accent-soft text-foreground",
    urgent: "border border-urgent bg-surface text-foreground",
  };
  return (
    <div role={tone === "urgent" ? "alert" : "status"} className={`rounded-2xl px-5 py-4 text-sm ${tones[tone]} ${className}`}>
      {children}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="font-display text-2xl font-black leading-tight tracking-tight sm:text-3xl">{children}</h1>
      {sub && <p className="max-w-2xl text-muted">{sub}</p>}
    </header>
  );
}

type PageWidth = "narrow" | "default" | "wide";

const PAGE_WIDTHS: Record<PageWidth, string> = {
  narrow: "max-w-xl",
  default: "max-w-3xl",
  wide: "max-w-[75rem]",
};

export function Page({
  children,
  className = "",
  width = "default",
}: {
  children: ReactNode;
  className?: string;
  width?: PageWidth;
}) {
  return (
    <main
      className={`mx-auto flex w-full ${PAGE_WIDTHS[width]} flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${className}`}
    >
      {children}
    </main>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
