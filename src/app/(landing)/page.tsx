import { Hero } from "@/components/landing/Hero";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Navbar } from "@/components/landing/Navbar";
import { getSession } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/server";

/** Public landing page. Signed-in students go straight to /checkin after sign-in. */
export default async function LandingPage() {
  const [{ locale, m }, session] = await Promise.all([getMessages(), getSession()]);

  return (
    <div lang={locale} className="grain relative flex min-h-svh flex-1 flex-col bg-ink text-white">
      <Navbar m={m} locale={locale} signedIn={session?.role === "student"} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 md:px-10">
        <Hero m={m} locale={locale} />
      </main>
      <LandingFooter m={m} />
    </div>
  );
}
