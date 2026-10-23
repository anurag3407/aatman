import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages/en";
import { AudioCard } from "./AudioCard";
import { CtaButton } from "./CtaButton";
import { Smiley } from "./Smiley";
import { Sparkle } from "./Sparkle";

export function Hero({ locale = "en", m }: { locale?: Locale; m?: Messages }) {
  const isHi = locale === "hi";
  return (
    <section className="relative flex flex-1 flex-col justify-center gap-14 py-10">
      <h1
        aria-label={isHi ? "आपकी बात सुनी जाएगी। आप अकेले नहीं हैं।" : "You’re heard. Not alone."}
        className="font-display text-[clamp(2rem,8.5vw,8rem)] font-black uppercase leading-[1.02] tracking-tight"
      >
        <span aria-hidden="true" className="block text-white">
          {isHi ? "आपकी बात सुनी जाएगी" : <>Y<Smiley />U’RE HEARD</>}
        </span>{" "}
        <span aria-hidden="true" className="block text-periwinkle">
          {isHi ? "आप अकेले नहीं हैं" : <>N<Smiley fill="#bdeb4a" />T ALONE</>}
        </span>
      </h1>

      <div className="grid gap-12 md:grid-cols-2 md:items-start">
        <div className="flex flex-col gap-8">
          <p className="flex items-center gap-4 text-lg text-lime">
            {isHi ? "चेक-इन करें।" : "Check in."}
            <span className="hidden h-px w-24 bg-periwinkle md:block" />
          </p>
          <AudioCard />
        </div>

        <div className="flex flex-col gap-10">
          <p className="max-w-md text-xl leading-relaxed text-white">
            {m?.home.body ?? (
              <>
                A quiet space for NIT Patna students to check in with themselves.{" "}
                <span className="text-lime">Take a moment for your wellbeing.</span>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-6">
            <Sparkle className="hidden h-10 w-10 shrink-0 text-periwinkle md:block" />
            <CtaButton href="/checkin">{m?.home.start ?? "Start a check-in"}</CtaButton>
            <CtaButton href="/crisis">{isHi ? "मदद चाहिए?" : "Need to talk to someone now?"}</CtaButton>
          </div>
        </div>
      </div>
    </section>
  );
}