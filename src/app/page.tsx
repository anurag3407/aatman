import { Hero } from "@/components/landing/Hero";
import { Navbar } from "@/components/landing/Navbar";

// Landing page. The check-in flow (Phase 2) will replace the "coming soon" text.
export default function Home() {
  return (
    <div className="grain flex flex-1 flex-col bg-ink text-white">
      <Navbar />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-16 md:px-10">
        <Hero />
      </main>
    </div>
  );
}
