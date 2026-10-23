import { Page, PageTitle } from "@/components/ui";
import { CONSENT_VERSION } from "@/lib/consent";
import { fmt } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/server";

export default async function PrivacyPage() {
  const { m } = await getMessages();
  return (
    <Page>
      <PageTitle eyebrow={m.common.appName} sub={fmt(m.privacy.updated, { version: CONSENT_VERSION })}>
        {m.privacy.title}
      </PageTitle>
      <div className="card-soft overflow-hidden rounded-[1.7rem] border border-border/75 bg-surface/75">
        {m.privacy.sections.map((s, i) => (
          <section
            key={s.h}
            className={`flex flex-col gap-1.5 px-5 py-5 sm:px-6 ${i > 0 ? "border-t border-border/60" : ""}`}
          >
            <h2 className="font-serif text-[1.05rem] font-medium leading-snug">{s.h}</h2>
            <p className="text-sm leading-relaxed text-muted">{s.p}</p>
          </section>
        ))}
      </div>
    </Page>
  );
}
