import { Grounding } from "@/components/exercises/Grounding";
import { BackLink, Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function GroundingPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <BackLink href="/exercises">{m.exercises.all}</BackLink>
      <PageTitle sub={m.exercises.grounding.desc}>{m.exercises.grounding.title}</PageTitle>
      <Grounding />
    </Page>
  );
}
