import Link from "next/link";
import type { Locale, Messages } from "@/lib/i18n";
import { CompanionMark } from "./Companion";
import { IconGear, IconPhone } from "./icons";
import { LanguageToggle } from "./LanguageToggle";
import { QuickExit } from "./QuickExit";

export function SiteHeader({ m, locale, signedIn }: { m: Messages; locale: Locale; signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-20 px-3 pt-3">
      <div className="glass card-soft mx-auto flex w-full max-w-xl items-center gap-1 rounded-[1.5rem] border border-border/70 px-2 py-1.5">
        <Link href="/" className="mr-auto flex min-h-10 items-center gap-2 rounded-full pl-0.5 pr-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft/45 ring-1 ring-border/60">
            <CompanionMark className="h-8 w-8" />
          </span>
          <span className="font-serif text-[1.3rem] leading-none tracking-[-0.01em]">{m.common.appName}</span>
        </Link>

        <Link
          href="/crisis"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-urgent px-3 text-[0.8rem] font-semibold text-urgent-foreground transition duration-300 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-urgent"
        >
          <IconPhone className="h-3.5 w-3.5" />
          {m.common.helpNow}
        </Link>

        <LanguageToggle locale={locale} label={m.common.language} />

        {signedIn && (
          <Link
            href="/settings"
            aria-label={m.common.nav.settings}
            title={m.common.nav.settings}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition duration-300 hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconGear className="h-[1.1rem] w-[1.1rem]" />
          </Link>
        )}

        <QuickExit label={m.common.quickExit} hint={m.common.quickExitLabel} />
      </div>
    </header>
  );
}
