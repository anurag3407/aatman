import Link from "next/link";
import type { Locale, Messages } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { QuickExit } from "./QuickExit";

export function SiteHeader({ m, locale, signedIn }: { m: Messages; locale: Locale; signedIn: boolean }) {
  const nav = [
    { href: "/checkin", label: m.common.nav.checkin },
    { href: "/exercises", label: m.common.nav.exercises },
    ...(signedIn
      ? [
          { href: "/chat", label: m.common.nav.chat },
          { href: "/book", label: m.common.nav.book },
          { href: "/history", label: m.common.nav.history },
          { href: "/settings", label: m.common.nav.settings },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[75rem] flex-wrap items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mr-auto font-display text-lg font-black tracking-tight text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:text-xl"
        >
          {m.common.appName}.
        </Link>
        <Link
          href="/crisis"
          className="min-h-10 content-center rounded-md bg-urgent px-3 text-sm font-semibold text-urgent-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-urgent sm:px-4"
        >
          {m.common.helpNow}
        </Link>
        <LanguageToggle
          locale={locale}
          label={m.common.language}
          className="text-muted hover:bg-accent-soft hover:text-foreground focus-visible:outline-accent"
        />
        <QuickExit label={m.common.quickExit} hint={m.common.quickExitLabel} />
      </div>
      <nav aria-label="Main" className="mx-auto w-full max-w-[75rem] overflow-x-auto px-2 pb-2 sm:px-4 lg:px-8">
        <ul className="flex gap-1 text-sm lg:justify-center">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block whitespace-nowrap rounded-md px-3 py-2 text-muted transition hover:bg-accent-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
