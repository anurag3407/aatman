import { redirect } from "next/navigation";
import { CheckinFlow } from "@/components/checkin/CheckinFlow";
import { Page } from "@/components/ui";
import { hasCurrentConsent } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";

export default async function CheckinPage({ searchParams }: PageProps<"/checkin">) {
  const { mode } = await searchParams;
  const stateless = mode === "stateless";

  if (!stateless) {
    // Consent comes before sign-in, so unknown visitors start at the consent screen.
    const session = await getSession();
    if (!session) redirect("/consent");
    if (session.role !== "student") redirect("/");
    if (!(await hasCurrentConsent(session.sub))) redirect("/consent");
  }

  return (
    <Page width="narrow">
      <CheckinFlow stateless={stateless} />
    </Page>
  );
}
