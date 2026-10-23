import Link from "next/link";
import type { Messages } from "@/lib/i18n";
import { EMERGENCY_112, TELE_MANAS } from "@/lib/safety/helplines";

/** Primary one-tap calls, shown first for urgent and crisis tiers. */
export function CrisisActions({ m, tone }: { m: Messages; tone: "crisis" | "urgent" }) {
  return (
    <section
      aria-labelledby="crisis-actions"
      className={`card-soft relative flex flex-col gap-3 overflow-hidden rounded-[1.8rem] border bg-surface/85 p-5 sm:p-6 ${
        tone === "crisis" ? "border-urgent/45" : "border-border/80"
      }`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-urgent/12 blur-3xl" />
      <h2 id="crisis-actions" className="font-serif text-[1.3rem] font-medium leading-snug">
        {m.results.crisisTitle}
      </h2>
      <p className="text-sm leading-relaxed text-muted">{m.results.crisisBody}</p>
      <a
        href={`tel:${TELE_MANAS.tel}`}
        className="mt-1 flex min-h-14 items-center justify-center rounded-full bg-accent px-5 text-[1rem] font-semibold text-accent-foreground shadow-md shadow-accent/20 transition duration-300 hover:brightness-105"
      >
        {m.results.callTeleManas}
      </a>
      <a
        href={`tel:${EMERGENCY_112.tel}`}
        className="flex min-h-14 items-center justify-center rounded-full bg-urgent px-5 text-[1rem] font-semibold text-urgent-foreground shadow-md shadow-urgent/20 transition duration-300 hover:brightness-105"
      >
        {m.results.call112}
      </a>
      <Link href="/crisis" className="text-center text-sm underline decoration-border underline-offset-4 transition hover:text-foreground">
        {m.results.allHelplines}
      </Link>
    </section>
  );
}
