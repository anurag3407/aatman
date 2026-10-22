import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/guards";

export const metadata = { title: "Aatman · Staff" };

export default async function StaffLayout({ children }: LayoutProps<"/">) {
  const session = await requireStaffPage();
  const links =
    session.role === "admin"
      ? [{ href: "/admin", label: "Dashboard" }]
      : [
          { href: "/counsellor", label: "Requests & sessions" },
          { href: "/counsellor/slots", label: "Slots" },
          { href: "/admin", label: "Dashboard" },
        ];

  return (
    <div className="grain flex flex-1 flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[75rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <span className="mr-auto font-display text-lg font-black tracking-tight text-accent">Aatman staff</span>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Staff">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-muted transition hover:bg-accent-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="hidden text-xs text-muted md:inline">{session.email}</span>
          <form method="post" action="/api/auth/logout">
            <button
              type="submit"
              className="rounded-md px-3 py-2 text-sm text-muted transition hover:bg-accent-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[75rem] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
