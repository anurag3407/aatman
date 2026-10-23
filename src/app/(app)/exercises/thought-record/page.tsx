import { ThoughtRecord } from "@/components/exercises/ThoughtRecord";
import { BackLink, Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function ThoughtRecordPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <BackLink href="/exercises">{m.exercises.all}</BackLink>
      <PageTitle sub={m.exercises.thought.desc}>{m.exercises.thought.title}</PageTitle>
      <ThoughtRecord />
    </Page>
  );
}
