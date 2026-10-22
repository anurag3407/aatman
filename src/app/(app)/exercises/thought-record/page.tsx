import Link from "next/link";
import { ThoughtRecord } from "@/components/exercises/ThoughtRecord";
import { mutedLinkClass, Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function ThoughtRecordPage() {
  const { m } = await getMessages();
  return (
    <Page width="narrow">
      <Link href="/exercises" className={`inline-flex items-center gap-1 text-sm ${mutedLinkClass}`}>
        ← {m.exercises.all}
      </Link>
      <PageTitle sub={m.exercises.thought.desc}>{m.exercises.thought.title}</PageTitle>
      <ThoughtRecord />
    </Page>
  );
}
