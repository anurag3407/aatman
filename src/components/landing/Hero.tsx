import type { Locale, Messages } from "@/lib/i18n";
import { AudioCard } from "./AudioCard";
import { CtaButton } from "./CtaButton";
import { Smiley } from "./Smiley";
import { Sparkle } from "./Sparkle";

function HeadlineLine({
  text,
  smileyAt,
  smileyFill,
  sparkleClass,
}: {
  text: string;
  smileyAt: "first" | "last";
  smileyFill: string;
  sparkleClass: string;
}) {
  const upper = text.toUpperCase();
  const oIndex = smileyAt === "first" ? upper.indexOf("O") : upper.lastIndexOf("O");

  return (
    <>
      {Array.from(text).map((char, i) => {
        if (i === oIndex) {
          return (
            <span key={i} className="relative">
              <span className="sr-only">O</span>
              <Smiley fill={smileyFill} />
            </span>
          );
        }
        if (i === text.length - 1 && char === "U") {
          return (
            <span key={i} className="relative inline-block">
              {char}
              <Sparkle className={`absolute right-[0.04em] top-[0.02em] h-[0.18em] w-[0.18em] ${sparkleClass}`} />
            </span>
          );
        }
        return <span key={i}>{char}</span>;
      })}
    </>
  );
}

export function Hero({ m, locale }: { m: Messages; locale: Locale }) {
  return (
    <section className="flex flex-1 flex-col justify-center gap-8 py-3 md:gap-10 md:py-6">
      <h1
        aria-label={m.landing.headlineAria}
        className="font-display text-[clamp(2.2rem,min(11.5vw,13svh),8.5rem)] font-black uppercase leading-[0.94] tracking-[-0.03em]"
      >
        {locale === "en" ? (
          <>
            <span aria-hidden="true" className="block text-white">
              <HeadlineLine text={m.landing.headline1} smileyAt="last" smileyFill="#6d4fe0" sparkleClass="text-lime" />
            </span>
            <span aria-hidden="true" className="block text-periwinkle">
              <HeadlineLine text={m.landing.headline2} smileyAt="first" smileyFill="#bdeb4a" sparkleClass="text-white" />
            </span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="block text-white">
              {m.landing.headline1}
            </span>
            <span aria-hidden="true" className="block text-periwinkle">
              {m.landing.headline2}
            </span>
          </>
        )}
      </h1>

      <div className="grid gap-8 md:grid-cols-2 md:items-start md:gap-10">
        <div className="flex flex-col gap-7">
          <p className="flex items-center gap-4 text-lg text-lime md:text-xl">
            {m.landing.label}
            <span aria-hidden="true" className="hidden h-px w-24 bg-periwinkle md:block" />
          </p>

          <AudioCard label={m.landing.breathing} badge={m.landing.badge} />

          <div className="hidden items-start gap-4 text-sm text-white/75 md:flex md:text-base">
            <Sparkle className="mt-1 h-5 w-5 shrink-0 text-periwinkle" />
            <p className="max-w-sm leading-relaxed">{m.landing.trust}</p>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <p className="max-w-md text-lg leading-relaxed text-lime md:hidden">{m.landing.bodyMobile}</p>
          <p className="hidden max-w-md text-lg leading-relaxed text-lime md:block md:text-xl">{m.landing.body}</p>
          <div className="flex flex-col gap-4">
            <CtaButton href="/checkin">{m.landing.cta}</CtaButton>
            <p className="text-sm text-white/60">{m.landing.privacy}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
