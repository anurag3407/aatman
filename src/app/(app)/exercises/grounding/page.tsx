import Link from "next/link";
import { Grounding } from "@/components/exercises/Grounding";
import { mutedLinkClass, Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function GroundingPage() {
  const { m } = await getMessages();
  return (
    <Page width="narrow">
      <Link href="/exercises" className={`inline-flex items-center gap-1 text-sm ${mutedLinkClass}`}>
        ← {m.exercises.all}
      </Link>
      <PageTitle sub={m.exercises.grounding.desc}>{m.exercises.grounding.title}</PageTitle>
      <Grounding />
    </Page>
  );
}
