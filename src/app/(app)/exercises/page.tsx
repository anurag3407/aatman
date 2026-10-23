import Link from "next/link";
import { CompanionNote } from "@/components/Companion";
import { IconArrowRight, IconEye, IconMoon, IconNotebook, IconWind } from "@/components/icons";
import { Page, PageTitle } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";

export default async function ExercisesPage() {
  const { m } = await getMessages();
  const e = m.exercises;
  const items = [
    { href: "/exercises/breathing", ...e.breathing, Icon: IconWind, tint: "var(--accent-soft)" },
    { href: "/exercises/grounding", ...e.grounding, Icon: IconEye, tint: "color-mix(in srgb, var(--sky) 32%, var(--surface))" },
    { href: "/exercises/sleep", ...e.sleep, Icon: IconMoon, tint: "color-mix(in srgb, var(--lilac) 30%, var(--surface))" },
    { href: "/exercises/thought-record", ...e.thought, Icon: IconNotebook, tint: "color-mix(in srgb, var(--glow) 32%, var(--surface))" },
  ];

  return (
    <Page>
      <PageTitle eyebrow={m.common.appName} sub={e.intro}>
        {e.title}
      </PageTitle>

      <CompanionNote title={m.companion.slow} body={m.companion.slowSub} mark={false} />

      <ul className="stagger flex flex-col gap-3">
        {items.map(({ href, title, desc, Icon, tint }) => (
          <li key={href}>
            <Link
              href={href}
              className="card-soft group flex items-center gap-4 rounded-[1.6rem] border border-border/75 bg-surface/80 p-4 transition duration-300 hover:border-accent/40 hover:bg-accent-soft/30 sm:p-5"
            >
              <span
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: tint }}
              >
                <Icon className="h-6 w-6 text-foreground/70" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-serif text-lg leading-snug">{title}</span>
                <span className="text-sm leading-relaxed text-muted">{desc}</span>
              </span>
              <IconArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted transition duration-300 group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
