import Link from "next/link";
import { Breathing } from "@/components/exercises/Breathing";
import { Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function BreathingPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <Link href="/exercises" className="text-sm text-muted underline underline-offset-4">
        ← {m.exercises.all}
      </Link>
      <PageTitle>{m.exercises.breathing.title}</PageTitle>
      <Breathing />
    </Page>
  );
}
