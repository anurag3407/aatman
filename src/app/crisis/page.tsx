import type { Metadata } from "next";
import Link from "next/link";
import { CompanionMark } from "@/components/Companion";
import { IconPhone } from "@/components/icons";
import { QuickExit } from "@/components/QuickExit";
import { ANTI_RAGGING, crisisHelplines, EMERGENCY_112, TELE_MANAS, type Helpline } from "@/lib/safety/helplines";

export const metadata: Metadata = {
  title: "Aatman · Help now",
};

/**
 * Static, precached by the service worker, with no data fetching and no LLM, so it renders
 * instantly and offline. Shows English and Hindi together: someone in crisis
 * shouldn't have to find a language switch.
 */
export default function CrisisPage() {
  const others = crisisHelplines().filter((h) => h.id !== TELE_MANAS.id && h.id !== EMERGENCY_112.id);

  return (
    <main className="app-shell mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pb-16 pt-4">
      <nav className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2 rounded-full py-1.5 pr-2 text-sm text-muted transition hover:text-foreground">
          <CompanionMark className="h-7 w-7" breathing={false} />
          <span aria-hidden>←</span> Aatman
        </Link>
        <QuickExit label="Quick exit · तुरंत बाहर" hint="Leave this site quickly / इस साइट से तुरंत बाहर निकलें" />
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-[2rem] font-medium leading-[1.15] tracking-[-0.015em] text-balance">
          You don&apos;t have to go through this alone.
          <span lang="hi" className="mt-1.5 block text-[1.45rem] font-normal leading-snug text-muted">
            आपको यह अकेले नहीं झेलना है।
          </span>
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Talking to someone right now can help. These lines are free and confidential.
          <span lang="hi" className="block">
            अभी किसी से बात करना मदद कर सकता है। ये लाइनें निःशुल्क और गोपनीय हैं।
          </span>
        </p>
      </header>

      <PrimaryCall helpline={TELE_MANAS} />

      <a
        href={`tel:${EMERGENCY_112.tel}`}
        className="card-soft flex min-h-16 items-center justify-between gap-4 rounded-[1.7rem] bg-urgent px-5 py-4 text-urgent-foreground shadow-md shadow-urgent/20 transition duration-300 hover:brightness-105"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">In immediate danger? Call 112</span>
          <span lang="hi" className="text-sm opacity-90">
            तुरंत खतरा है? 112 पर कॉल करें
          </span>
        </span>
        <span aria-hidden className="flex items-center gap-2 text-2xl font-semibold">
          <IconPhone className="h-5 w-5" />
          112
        </span>
      </a>

      <section aria-labelledby="more-help" className="flex flex-col gap-3">
        <h2 id="more-help" className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted">
          More support · और सहायता
        </h2>
        {others.map((h) => (
          <HelplineRow key={h.id} helpline={h} />
        ))}
      </section>

      <section
        aria-labelledby="breathe"
        className="card-soft flex flex-col items-center gap-5 rounded-[1.9rem] border border-border/75 bg-surface/80 px-5 py-7 text-center"
      >
        <h2 id="breathe" className="font-serif text-[1.15rem] font-medium leading-snug">
          While you wait, breathe with the circle
          <span lang="hi" className="mt-1 block text-sm font-normal text-muted">
            इंतज़ार करते हुए, घेरे के साथ साँस लें
          </span>
        </h2>
        <div className="relative flex h-40 w-40 items-center justify-center">
          <div aria-hidden className="absolute inset-2 rounded-full border border-border/50" />
          <div aria-hidden className="orb-core h-32 w-32 rounded-full animate-box-breath" />
          <CompanionMark className="absolute h-12 w-12 opacity-90" breathing={false} />
        </div>
        <p className="text-sm leading-relaxed text-muted">
          In for 4 · hold for 4 · out for 4 · hold for 4
          <span lang="hi" className="block">
            4 तक साँस लें · 4 तक रोकें · 4 तक छोड़ें · 4 तक रोकें
          </span>
        </p>
      </section>

      <section aria-labelledby="ragging" className="flex flex-col gap-3">
        <h2 id="ragging" className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted">
          Facing ragging? · रैगिंग हो रही है?
        </h2>
        <HelplineRow helpline={ANTI_RAGGING} />
      </section>

      <p className="rounded-[1.5rem] border border-border/60 bg-accent-soft/55 px-5 py-4 text-sm leading-relaxed">
        This app can&apos;t call anyone for you, and no one watches it in real time. If you&apos;re
        unsafe, please call one of the numbers above or go to someone you trust.
        <span lang="hi" className="mt-1 block">
          यह ऐप आपकी ओर से किसी को कॉल नहीं कर सकता और इसे कोई लगातार नहीं देखता। अगर आप सुरक्षित नहीं
          हैं, तो ऊपर दिए किसी नंबर पर कॉल करें या किसी भरोसेमंद व्यक्ति के पास जाएँ।
        </span>
      </p>
    </main>
  );
}

function PrimaryCall({ helpline }: { helpline: Helpline }) {
  return (
    <div className="card-soft relative flex flex-col gap-4 overflow-hidden rounded-[1.9rem] border border-border/75 bg-surface/85 p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-glow/25 blur-3xl" />
      <div className="flex items-start gap-3">
        <CompanionMark className="h-10 w-10 shrink-0" />
        <div>
          <p className="font-serif text-[1.15rem] font-medium leading-snug">
            {helpline.name.en} <span lang="hi">· {helpline.name.hi}</span>
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{helpline.description.en}</p>
          <p lang="hi" className="text-sm leading-relaxed text-muted">
            {helpline.description.hi}
          </p>
          <p className="mt-1.5 text-xs text-muted">{helpline.hours.en}</p>
        </div>
      </div>
      <a
        href={`tel:${helpline.tel}`}
        className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[1rem] font-semibold text-accent-foreground shadow-md shadow-accent/25 transition duration-300 hover:brightness-105"
      >
        <IconPhone className="h-5 w-5" />
        Call {helpline.number} · कॉल करें
      </a>
      {helpline.alt && (
        <a href={`tel:${helpline.alt.tel}`} className="text-center text-sm text-muted underline decoration-border underline-offset-4">
          or {helpline.alt.number}
        </a>
      )}
    </div>
  );
}

function HelplineRow({ helpline }: { helpline: Helpline }) {
  return (
    <a
      href={`tel:${helpline.tel}`}
      className="flex min-h-14 items-center justify-between gap-4 rounded-[1.4rem] border border-border/75 bg-surface/75 px-5 py-4 transition duration-300 hover:border-accent/40 hover:bg-accent-soft/30"
    >
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">
          {helpline.name.en} <span lang="hi">· {helpline.name.hi}</span>
        </span>
        <span className="text-xs text-muted">{helpline.description.en}</span>
        <span className="text-xs text-muted">{helpline.hours.en}</span>
      </span>
      <span className="shrink-0 font-semibold text-accent">{helpline.number}</span>
    </a>
  );
}
