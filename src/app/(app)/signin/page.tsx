import Link from "next/link";
import { redirect } from "next/navigation";
import { Banner, Button, Card, LinkButton, Page, PageTitle, inputClass } from "@/components/ui";
import { landingPathFor } from "@/lib/auth/login";
import { getSession } from "@/lib/auth/session";
import { devLoginEnabled, googleConfigured, microsoftConfigured } from "@/lib/env";
import { getMessages } from "@/lib/i18n/server";

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const [{ m }, session, params] = await Promise.all([getMessages(), getSession(), searchParams]);
  if (session) redirect(landingPathFor(session.role));

  const errorKey = typeof params.error === "string" && params.error in m.signin.errors ? (params.error as keyof typeof m.signin.errors) : null;
  const google = googleConfigured();
  const microsoft = microsoftConfigured();
  const dev = devLoginEnabled();

  return (
    <Page>
      <PageTitle sub={m.signin.body}>{m.signin.title}</PageTitle>
      {errorKey && <Banner tone="urgent">{m.signin.errors[errorKey]}</Banner>}

      <div className="flex flex-col gap-3">
        {/* Plain links (GET), so the IdP redirect isn't subject to form-action CSP. */}
        {google && (
          <LinkButton href="/api/auth/login/google" prefetch={false} variant="secondary">
            {m.signin.google}
          </LinkButton>
        )}
        {microsoft && (
          <LinkButton href="/api/auth/login/microsoft" prefetch={false} variant="secondary">
            {m.signin.microsoft}
          </LinkButton>
        )}
        {!google && !microsoft && !dev && <Banner>{m.signin.none}</Banner>}
      </div>

      {dev && (
        <Card>
          <h2 className="font-semibold">{m.signin.dev}</h2>
          <form method="post" action="/api/auth/dev-login" className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              {m.signin.devEmail}
              <input name="email" type="email" required defaultValue="student1@nitp.ac.in" className={inputClass} />
            </label>
            <Button type="submit">{m.signin.devSubmit}</Button>
          </form>
        </Card>
      )}

      <Link href="/checkin?mode=stateless" className="text-center text-sm text-muted underline underline-offset-4">
        {m.signin.minor}
      </Link>
    </Page>
  );
}
