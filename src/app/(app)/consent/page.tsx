import { ConsentForm } from "@/components/ConsentForm";
import { Banner, Card, Page, PageTitle } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export default async function ConsentPage() {
  const [{ m }, session] = await Promise.all([getMessages(), getSession()]);

  let previouslyConsented = false;
  if (session?.role === "student") {
    const db = await getDb();
    const [row] = await db
      .select({ v: schema.students.consentVersion })
      .from(schema.students)
      .where(eq(schema.students.pseudonym, session.sub));
    previouslyConsented = Boolean(row?.v);
  }

  return (
    <Page>
      <PageTitle eyebrow={m.common.appName} sub={m.consent.intro}>{m.consent.title}</PageTitle>
      {previouslyConsented && <Banner>{m.consent.updated}</Banner>}
      <Card>
        <ul className="flex flex-col gap-3.5">
          {m.consent.points.map((p) => (
            <li key={p} className="flex gap-3 text-[0.92rem] leading-relaxed">
              <span aria-hidden className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Card>
      <ConsentForm signedIn={session?.role === "student"} />
    </Page>
  );
}
