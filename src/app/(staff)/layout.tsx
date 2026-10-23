import Link from "next/link";
import { CompanionMark } from "@/components/Companion";
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
    <div className="app-shell flex flex-1 flex-col">
      <header className="sticky top-0 z-20 px-3 pt-3">
        <div className="glass card-soft mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[1.4rem] border border-border/70 px-3 py-2">
          <span className="mr-auto flex items-center gap-2.5">
            <CompanionMark className="h-8 w-8" />
            <span className="font-serif text-[1.15rem] leading-none">
              Aatman <span className="font-sans text-xs uppercase tracking-[0.14em] text-muted">staff</span>
            </span>
          </span>
          <nav className="flex flex-wrap gap-1 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-3 py-2 transition duration-300 hover:bg-surface/80 hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="hidden text-xs text-muted sm:inline">{session.email}</span>
          <form method="post" action="/api/auth/logout">
            <button
              type="submit"
              className="rounded-full px-3 py-2 text-sm text-muted transition duration-300 hover:bg-surface/80 hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="animate-rise mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-5 py-6 sm:py-8">{children}</main>
    </div>
  );
}
