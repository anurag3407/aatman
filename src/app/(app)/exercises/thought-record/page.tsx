import Link from "next/link";
import { ThoughtRecord } from "@/components/exercises/ThoughtRecord";
import { Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function ThoughtRecordPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <Link href="/exercises" className="text-sm text-muted underline underline-offset-4">
        ← {m.exercises.all}
      </Link>
      <PageTitle sub={m.exercises.thought.desc}>{m.exercises.thought.title}</PageTitle>
      <ThoughtRecord />
    </Page>
  );
}
