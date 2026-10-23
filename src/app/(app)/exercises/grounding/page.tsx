import Link from "next/link";
import { Grounding } from "@/components/exercises/Grounding";
import { Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function GroundingPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <Link href="/exercises" className="text-sm text-muted underline underline-offset-4">
        ← {m.exercises.all}
      </Link>
      <PageTitle sub={m.exercises.grounding.desc}>{m.exercises.grounding.title}</PageTitle>
      <Grounding />
    </Page>
  );
}
