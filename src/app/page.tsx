import { Hero } from "@/components/landing/Hero";
import { Navbar } from "@/components/landing/Navbar";
import { getMessages } from "@/lib/i18n/server";

export default async function Home() {
  const { locale, m } = await getMessages();
  return (
    <div lang={locale} className="grain flex flex-1 flex-col bg-ink text-white">
      <Navbar locale={locale} m={m} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-16 md:px-10">
        <Hero locale={locale} m={m} />
      </main>
    </div>
  );
}
