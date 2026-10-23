import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { SiteHeader } from "@/components/SiteHeader";
import { getSession } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n/client";
import { getMessages } from "@/lib/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ locale, m }, session] = await Promise.all([getMessages(), getSession()]);
  const signedIn = session?.role === "student";

  return (
    <I18nProvider locale={locale}>
      <div lang={locale} className="app-shell flex flex-1 flex-col">
        <SiteHeader m={m} locale={locale} signedIn={signedIn} />
        {children}
        <footer className="mx-auto w-full max-w-xl px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-2 text-xs leading-relaxed text-muted">
          <div aria-hidden className="mb-3 h-px w-14 bg-border" />
          <p>{m.common.notDiagnosis}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/privacy" className="underline decoration-border underline-offset-4 transition hover:text-foreground">
              {m.common.privacyNotice}
            </Link>
            {signedIn && (
              <Link href="/settings" className="underline decoration-border underline-offset-4 transition hover:text-foreground">
                {m.common.nav.settings}
              </Link>
            )}
          </div>
        </footer>
        <AppNav labels={{ ...m.common.nav, signIn: m.common.signIn }} signedIn={signedIn} />
      </div>
    </I18nProvider>
  );
}
