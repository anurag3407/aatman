import Link from "next/link";
import { Card, Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function SleepPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <Link href="/exercises" className="text-sm text-muted underline underline-offset-4">
        ← {m.exercises.all}
      </Link>
      <PageTitle sub={m.exercises.sleep.desc}>{m.exercises.sleep.title}</PageTitle>
      <Card>
        <ul className="flex list-disc flex-col gap-3 pl-5">
          {m.exercises.sleep.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
