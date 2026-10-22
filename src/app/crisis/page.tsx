import type { Metadata } from "next";
import Link from "next/link";
import { QuickExit } from "@/components/QuickExit";
import { mutedLinkClass } from "@/components/ui";
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:py-8">
      <nav className="flex items-center justify-between">
        <Link href="/" className={`inline-flex items-center gap-1 text-sm ${mutedLinkClass}`}>
          ← Aatman
        </Link>
        <QuickExit label="Quick exit · तुरंत बाहर" hint="Leave this site quickly / इस साइट से तुरंत बाहर निकलें" />
      </nav>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold leading-snug sm:text-3xl">
          You don&apos;t have to go through this alone.
          <span lang="hi" className="mt-1 block text-xl font-normal text-muted">
            आपको यह अकेले नहीं झेलना है।
          </span>
        </h1>
        <p className="text-muted">
          Talking to someone right now can help. These lines are free and confidential.
          <span lang="hi" className="block">
            अभी किसी से बात करना मदद कर सकता है। ये लाइनें निःशुल्क और गोपनीय हैं।
          </span>
        </p>
      </header>

      <PrimaryCall helpline={TELE_MANAS} />

      <a
        href={`tel:${EMERGENCY_112.tel}`}
        className="flex min-h-14 items-center justify-between gap-4 rounded-md bg-urgent px-5 py-4 text-urgent-foreground"
      >
        <span className="flex flex-col">
          <span className="font-semibold">In immediate danger? Call 112</span>
          <span lang="hi" className="text-sm opacity-90">
            तुरंत खतरा है? 112 पर कॉल करें
          </span>
        </span>
        <span aria-hidden className="text-2xl font-semibold">
          112
        </span>
      </a>

      <section aria-labelledby="more-help" className="flex flex-col gap-3">
        <h2 id="more-help" className="text-sm font-medium uppercase tracking-wide text-muted">
          More support · और सहायता
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((h) => (
            <HelplineRow key={h.id} helpline={h} />
          ))}
        </div>
      </section>
      <section
        aria-labelledby="breathe"
        className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-6 text-center"
      >
        <h2 id="breathe" className="font-medium">
          While you wait, breathe with the circle
          <span lang="hi" className="block text-sm font-normal text-muted">
            इंतज़ार करते हुए, घेरे के साथ साँस लें
          </span>
        </h2>
        <div className="flex h-40 w-40 items-center justify-center">
          <div aria-hidden className="h-full w-full rounded-full bg-accent-soft animate-box-breath" />
        </div>
        <p className="text-sm text-muted">
          In for 4 · hold for 4 · out for 4 · hold for 4
          <span lang="hi" className="block">
            4 तक साँस लें · 4 तक रोकें · 4 तक छोड़ें · 4 तक रोकें
          </span>
        </p>
      </section>

      <section aria-labelledby="ragging" className="flex flex-col gap-3">
        <h2 id="ragging" className="text-sm font-medium uppercase tracking-wide text-muted">
          Facing ragging? · रैगिंग हो रही है?
        </h2>
        <HelplineRow helpline={ANTI_RAGGING} />
      </section>

      <p className="rounded-2xl bg-accent-soft px-5 py-4 text-sm">
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
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div>
        <p className="font-semibold">
          {helpline.name.en} <span lang="hi">· {helpline.name.hi}</span>
        </p>
        <p className="text-sm text-muted">{helpline.description.en}</p>
        <p lang="hi" className="text-sm text-muted">
          {helpline.description.hi}
        </p>
        <p className="mt-1 text-sm text-muted">{helpline.hours.en}</p>
      </div>
      <a
        href={`tel:${helpline.tel}`}
        className="flex min-h-14 items-center justify-center rounded-md bg-accent px-5 text-lg font-semibold text-accent-foreground"
      >
        Call {helpline.number} · कॉल करें
      </a>
      {helpline.alt && (
        <a href={`tel:${helpline.alt.tel}`} className={`text-center text-sm ${mutedLinkClass}`}>
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
      className="flex min-h-14 items-center justify-between gap-4 rounded-md border border-border bg-surface px-5 py-4"
    >
      <span className="flex flex-col">
        <span className="font-medium">
          {helpline.name.en} <span lang="hi">· {helpline.name.hi}</span>
        </span>
        <span className="text-sm text-muted">{helpline.description.en}</span>
        <span className="text-sm text-muted">{helpline.hours.en}</span>
      </span>
      <span className="shrink-0 font-semibold text-accent">{helpline.number}</span>
    </a>
  );
}
