import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { mutedLinkClass } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n/client";
import { getMessages } from "@/lib/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ locale, m }, session] = await Promise.all([getMessages(), getSession()]);
  return (
    <I18nProvider locale={locale}>
      <div lang={locale} className="grain flex flex-1 flex-col bg-background text-foreground">
        <SiteHeader m={m} locale={locale} signedIn={session?.role === "student"} />
        {children}
        <footer className="mx-auto w-full max-w-[75rem] px-4 py-6 text-xs text-muted sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p>{m.common.notDiagnosis}</p>
            <Link href="/privacy" className={mutedLinkClass}>
              {m.common.privacyNotice}
            </Link>
          </div>
        </footer>
      </div>
    </I18nProvider>
  );
}
