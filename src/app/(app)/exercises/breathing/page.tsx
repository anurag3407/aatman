import { Breathing } from "@/components/exercises/Breathing";
import { BackLink, Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function BreathingPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <BackLink href="/exercises">{m.exercises.all}</BackLink>
      <PageTitle sub={m.exercises.breathing.desc}>{m.exercises.breathing.title}</PageTitle>
      <Breathing />
    </Page>
  );
}
