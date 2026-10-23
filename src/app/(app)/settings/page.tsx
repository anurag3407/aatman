import { EraseForm } from "@/components/EraseForm";
import { Button, Card, Page, PageTitle } from "@/components/ui";
import { requireStudentPage } from "@/lib/auth/guards";
import { getMessages } from "@/lib/i18n/server";

export default async function SettingsPage() {
  await requireStudentPage();
  const { m } = await getMessages();
  return (
    <Page>
      <PageTitle eyebrow={m.common.appName}>{m.settings.title}</PageTitle>

      <Card>
        <h2 className="font-serif text-[1.15rem] font-medium">{m.settings.exportTitle}</h2>
        <p className="text-sm leading-relaxed text-muted">{m.settings.exportBody}</p>
        <a
          href="/api/me/export"
          download
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-border bg-surface/75 px-5 font-medium transition duration-300 hover:border-accent/45 hover:bg-accent-soft/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {m.settings.exportCta}
        </a>
      </Card>

      <EraseForm />

      <form method="post" action="/api/auth/logout" className="pt-1">
        <Button type="submit" variant="ghost" className="w-full">
          {m.common.signOut}
        </Button>
      </form>
    </Page>
  );
}
