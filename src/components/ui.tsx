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
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-medium transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

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
    <section className={`flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 ${className}`} {...props}>
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
      <h1 className="text-2xl font-semibold leading-snug">{children}</h1>
      {sub && <p className="text-muted">{sub}</p>}
    </header>
  );
}

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 ${className}`}>{children}</main>;
}

export const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
