import Link from "next/link";
import type { Messages } from "@/lib/i18n";
import { EMERGENCY_112, TELE_MANAS } from "@/lib/safety/helplines";

/** Primary one-tap calls, shown first for urgent and crisis tiers. */
export function CrisisActions({ m, tone }: { m: Messages; tone: "crisis" | "urgent" }) {
  return (
    <section
      aria-labelledby="crisis-actions"
      className={`flex flex-col gap-3 rounded-2xl p-5 ${tone === "crisis" ? "border-2 border-urgent bg-surface" : "border border-border bg-surface"}`}
    >
      <h2 id="crisis-actions" className="text-lg font-semibold">
        {m.results.crisisTitle}
      </h2>
      <p className="text-muted">{m.results.crisisBody}</p>
      <a
        href={`tel:${TELE_MANAS.tel}`}
        className="flex min-h-14 items-center justify-center rounded-xl bg-accent px-5 text-lg font-semibold text-accent-foreground"
      >
        {m.results.callTeleManas}
      </a>
      <a
        href={`tel:${EMERGENCY_112.tel}`}
        className="flex min-h-14 items-center justify-center rounded-xl bg-urgent px-5 text-lg font-semibold text-urgent-foreground"
      >
        {m.results.call112}
      </a>
      <Link href="/crisis" className="text-center text-sm underline underline-offset-4">
        {m.results.allHelplines}
      </Link>
    </section>
  );
}
