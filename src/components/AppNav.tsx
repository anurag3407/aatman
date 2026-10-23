"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Messages } from "@/lib/i18n";
import { IconArrowRight, IconCalendar, IconChat, IconCheckin, IconClock, IconLeaf } from "./icons";

export type NavLabels = Messages["common"]["nav"] & { signIn: string };

export function AppNav({ labels, signedIn }: { labels: NavLabels; signedIn: boolean }) {
  const pathname = usePathname();

  const items = signedIn
    ? [
        { href: "/checkin", label: labels.checkin, Icon: IconCheckin },
        { href: "/exercises", label: labels.exercises, Icon: IconLeaf },
        { href: "/chat", label: labels.chat, Icon: IconChat },
        { href: "/book", label: labels.book, Icon: IconCalendar },
        { href: "/history", label: labels.history, Icon: IconClock },
      ]
    : [
        { href: "/checkin", label: labels.checkin, Icon: IconCheckin },
        { href: "/exercises", label: labels.exercises, Icon: IconLeaf },
        { href: "/signin", label: labels.signIn, Icon: IconArrowRight },
      ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.7rem,env(safe-area-inset-bottom))]"
    >
      <ul className="glass card-soft mx-auto flex w-full max-w-md gap-0.5 rounded-[1.55rem] border border-border/70 p-1.5">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[1.15rem] px-1 py-1.5 text-[0.66rem] font-medium tracking-[0.02em] transition duration-300 ${
                  active
                    ? "bg-accent text-accent-foreground shadow-sm shadow-accent/25"
                    : "text-muted hover:bg-surface/70 hover:text-foreground"
                }`}
              >
                <Icon className="h-[1.15rem] w-[1.15rem]" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
