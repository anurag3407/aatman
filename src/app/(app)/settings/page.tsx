import { EraseForm } from "@/components/EraseForm";
import { Button, Card, Page, PageTitle } from "@/components/ui";
import { requireStudentPage } from "@/lib/auth/guards";
import { getMessages } from "@/lib/i18n/server";

export default async function SettingsPage() {
  await requireStudentPage();
  const { m } = await getMessages();
  return (
    <Page>
      <PageTitle>{m.settings.title}</PageTitle>

      <Card>
        <h2 className="font-semibold">{m.settings.exportTitle}</h2>
        <p className="text-sm text-muted">{m.settings.exportBody}</p>
        <a
          href="/api/me/export"
          download
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-border px-5 font-medium hover:bg-accent-soft"
        >
          {m.settings.exportCta}
        </a>
      </Card>

      <EraseForm />

      <form method="post" action="/api/auth/logout">
        <Button type="submit" variant="ghost" className="w-full">
          {m.common.signOut}
        </Button>
      </form>
    </Page>
  );
}
