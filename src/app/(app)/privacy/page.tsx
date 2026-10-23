import { Page, PageTitle } from "@/components/ui";
import { CONSENT_VERSION } from "@/lib/consent";
import { fmt } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/server";

export default async function PrivacyPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <PageTitle sub={fmt(m.privacy.updated, { version: CONSENT_VERSION })}>{m.privacy.title}</PageTitle>
      {m.privacy.sections.map((s) => (
        <section key={s.h} className="flex flex-col gap-1">
          <h2 className="font-semibold">{s.h}</h2>
          <p className="text-muted">{s.p}</p>
        </section>
      ))}
    </Page>
  );
}
