import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { IconArrowLeft } from "./icons";

/** Small, accessible building blocks. Large tap targets (≥ 48px) throughout. */

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted transition duration-300 hover:bg-surface/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <IconArrowLeft className="h-4 w-4" />
      {children}
    </Link>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "urgent";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:brightness-105",
  secondary: "border border-border bg-surface/75 text-foreground hover:border-accent/45 hover:bg-accent-soft/60",
  ghost: "text-muted hover:bg-surface/70 hover:text-foreground",
  urgent: "bg-urgent text-urgent-foreground shadow-lg shadow-urgent/20 hover:brightness-105",
};

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-[0.95rem] font-medium tracking-[0.005em] transition duration-300 ease-out " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

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

/** A full-width answer/action row with a quiet reveal on hover. */
export function Choice({ className = "", children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={
        "group flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-border/75 bg-surface/65 px-5 py-3.5 text-left text-[0.97rem] leading-snug " +
        "transition duration-300 ease-out hover:border-accent/40 hover:bg-accent-soft/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
        "active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
      {...props}
    >
      <span className="text-pretty">{children}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-4 w-4 shrink-0 -translate-x-1 text-accent opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100"
      >
        <path d="M5 12h13M12.5 6.5 18 12l-5.5 5.5" />
      </svg>
    </button>
  );
}

export function Card({ className = "", children, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={`card-soft flex flex-col gap-3 rounded-[1.7rem] border border-border/75 bg-surface/80 p-5 backdrop-blur-[2px] sm:p-6 ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

export function Banner({ tone = "info", children, className = "" }: { tone?: "info" | "urgent"; children: ReactNode; className?: string }) {
  const tones = {
    info: "border border-border/60 bg-accent-soft/55",
    urgent: "border border-urgent/30 bg-urgent/8",
  };
  return (
    <div
      role={tone === "urgent" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm leading-relaxed ${tones[tone]} ${className}`}
    >
      <span
        aria-hidden
        className={`mt-[0.45rem] size-1.5 shrink-0 rounded-full ${tone === "urgent" ? "bg-urgent" : "bg-accent"}`}
      />
      <span>{children}</span>
    </div>
  );
}

export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted ${className}`}>{children}</p>
  );
}

export function PageTitle({ children, sub, eyebrow }: { children: ReactNode; sub?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2.5 pt-1">
      {eyebrow && <SectionLabel>{eyebrow}</SectionLabel>}
      <h1 className="font-serif text-[1.85rem] font-medium leading-[1.14] tracking-[-0.015em] text-balance sm:text-[2.1rem]">
        {children}
      </h1>
      {sub && <p className="max-w-prose text-[0.95rem] leading-relaxed text-muted text-pretty">{sub}</p>}
    </header>
  );
}

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`animate-rise mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pb-10 pt-5 sm:pt-7 ${className}`}>
      {children}
    </main>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-2xl border border-border/80 bg-surface/75 px-4 py-3 text-base text-foreground placeholder:text-muted/80 " +
  "transition duration-300 focus-visible:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/40";

export const textareaClass = `${inputClass} resize-y leading-relaxed`;
