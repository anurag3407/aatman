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
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="mr-auto font-semibold">Aatman staff</span>
          <nav className="flex gap-1 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 hover:bg-accent-soft">
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="text-xs text-muted">{session.email}</span>
          <form method="post" action="/api/auth/logout">
            <button type="submit" className="rounded-lg px-3 py-2 text-sm hover:bg-accent-soft">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}
