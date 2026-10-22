import Link from "next/link";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { Locale, Messages } from "@/lib/i18n";

export function Navbar({ m, locale, signedIn }: { m: Messages; locale: Locale; signedIn: boolean }) {
  const links = [
    { href: "/checkin", label: m.landing.nav.checkin },
    { href: "/exercises", label: m.landing.nav.exercises },
    { href: "/book", label: m.landing.nav.book },
  ];

  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-5 py-5 md:px-10">
      <Link
        href="/"
        className="font-display text-lg font-bold tracking-tight text-lime focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime md:text-xl"
      >
        {m.landing.brand}
      </Link>

      <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-sm text-white/80 transition hover:text-lime focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-1 sm:gap-3">
        <LanguageToggle
          locale={locale}
          label={m.common.language}
          className="text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-lime"
        />
        {!signedIn && (
          <Link
            href="/signin"
            className="hidden min-h-10 content-center rounded-md px-3 text-sm text-white/70 transition hover:text-white focus-visible:outline-2 focus-visible:outline-lime md:block"
          >
            {m.common.signIn}
          </Link>
        )}
        <Link
          href="/crisis"
          className="min-h-10 content-center rounded-md border border-urgent/60 px-3 text-xs font-semibold text-urgent transition hover:bg-urgent hover:text-urgent-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-urgent sm:px-4 sm:text-sm"
        >
          {m.landing.crisis}
        </Link>
      </div>
    </header>
  );
}
