import { IconMoon } from "@/components/icons";
import { BackLink, Card, Page, PageTitle, SectionLabel } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function SleepPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <BackLink href="/exercises">{m.exercises.all}</BackLink>
      <PageTitle sub={m.exercises.sleep.desc}>{m.exercises.sleep.title}</PageTitle>
      <Card className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full bg-lilac/25 blur-3xl" />
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface/70 text-muted">
            <IconMoon className="h-5 w-5" />
          </span>
          <SectionLabel>{m.exercises.sleep.title}</SectionLabel>
        </div>
        <ul className="mt-1 flex flex-col gap-4">
          {m.exercises.sleep.tips.map((tip, i) => (
            <li key={tip} className="flex gap-3 text-[0.95rem] leading-relaxed">
              <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft/80 text-[0.7rem] font-semibold text-accent"
              >
                {i + 1}
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
