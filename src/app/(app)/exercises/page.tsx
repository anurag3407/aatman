import Link from "next/link";
import { Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function ExercisesPage() {
  const { m } = await getMessages();
  const e = m.exercises;
  const items = [
    { href: "/exercises/breathing", ...e.breathing },
    { href: "/exercises/grounding", ...e.grounding },
    { href: "/exercises/sleep", ...e.sleep },
    { href: "/exercises/thought-record", ...e.thought },
  ];
  return (
    <Page width="wide">
      <PageTitle sub={e.intro}>{e.title}</PageTitle>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((i) => (
          <li key={i.href} className="h-full">
            <Link
              href={i.href}
              className="flex h-full flex-col gap-1 rounded-2xl border border-border bg-surface p-5 transition hover:border-accent/50 hover:bg-accent-soft sm:p-6"
            >
              <span className="font-semibold text-foreground">{i.title}</span>
              <span className="text-sm text-muted">{i.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
