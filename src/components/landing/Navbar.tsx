import Link from "next/link";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages/en";

const links = [
  { label: "About Us", href: "#" },
  { label: "Check-in", href: "/checkin" },
  { label: "Resources", href: "/exercises" },
  { label: "Journal", href: "#" },
];

export function Navbar({ locale = "en", m }: { locale?: Locale; m?: Messages }) {
  return (
    <header className="flex items-center justify-between gap-4 px-5 py-5 md:px-10">
      <Link href="/" className="font-display text-lg font-bold text-lime">
        Aatman.
      </Link>

      <nav aria-label="Main" className="hidden gap-8 md:flex">
        {links.map((l) => (
          <Link key={l.label} href={l.href} className="text-sm text-white hover:text-lime">
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        {m && <LanguageToggle locale={locale} label={m.common.language} />}
        <Link
          href="/crisis"
          className="text-sm font-bold text-lime underline-offset-4 hover:underline"
        >
          Need help now
        </Link>
      </div>
    </header>
  );
}