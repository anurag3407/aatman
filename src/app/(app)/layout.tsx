import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getSession } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n/client";
import { getMessages } from "@/lib/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ locale, m }, session] = await Promise.all([getMessages(), getSession()]);
  return (
    <I18nProvider locale={locale}>
      <div lang={locale} className="flex flex-1 flex-col">
        <SiteHeader m={m} locale={locale} signedIn={session?.role === "student"} />
        {children}
        <footer className="mx-auto w-full max-w-lg px-4 py-6 text-xs text-muted">
          <p>{m.common.notDiagnosis}</p>
          <Link href="/privacy" className="underline underline-offset-4">
            {m.common.privacyNotice}
          </Link>
        </footer>
      </div>
    </I18nProvider>
  );
}
