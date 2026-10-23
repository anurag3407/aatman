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
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-4 py-2">
        <Link href="/" className="mr-auto text-lg font-semibold">
          {m.common.appName}
        </Link>
        <Link
          href="/crisis"
          className="min-h-10 content-center rounded-lg bg-urgent px-3 text-sm font-semibold text-urgent-foreground"
        >
          {m.common.helpNow}
        </Link>
        <LanguageToggle locale={locale} label={m.common.language} />
        <QuickExit label={m.common.quickExit} hint={m.common.quickExitLabel} />
      </div>
      <nav aria-label="Main" className="mx-auto w-full max-w-lg overflow-x-auto px-2 pb-2">
        <ul className="flex gap-1 text-sm">
          {nav.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="block whitespace-nowrap rounded-lg px-3 py-2 text-muted hover:bg-accent-soft hover:text-foreground">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
