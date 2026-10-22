import Link from "next/link";
import { Breathing } from "@/components/exercises/Breathing";
import { mutedLinkClass, Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function BreathingPage() {
  const { m } = await getMessages();
  return (
    <Page width="narrow">
      <Link href="/exercises" className={`inline-flex items-center gap-1 text-sm ${mutedLinkClass}`}>
        ← {m.exercises.all}
      </Link>
      <PageTitle>{m.exercises.breathing.title}</PageTitle>
      <Breathing />
    </Page>
  );
}
