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
    <Page>
      <PageTitle sub={e.intro}>{e.title}</PageTitle>
      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5 hover:bg-accent-soft">
              <span className="font-semibold">{i.title}</span>
              <span className="text-sm text-muted">{i.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
