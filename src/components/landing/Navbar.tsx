import Link from "next/link";

// These pages don't exist yet, so the links point to "#" until the team builds them.
const links = [
  { label: "About Us", href: "#" },
  { label: "Check-in", href: "#" },
  { label: "Resources", href: "#" },
  { label: "Journal", href: "#" },
];

export function Navbar() {
  return (
    <header className="flex items-center justify-between gap-4 px-5 py-5 md:px-10">
      <Link href="/" className="font-display text-lg font-bold text-lime">
        Aatman.
      </Link>

      <nav aria-label="Main" className="hidden gap-8 md:flex">
        {links.map((l) => (
          <a key={l.label} href={l.href} className="text-sm text-white hover:text-lime">
            {l.label}
          </a>
        ))}
      </nav>

      <Link
        href="/crisis"
        className="text-sm font-bold text-lime underline-offset-4 hover:underline"
      >
        Need help now
      </Link>
    </header>
  );
}