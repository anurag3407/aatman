"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import { IconGlobe } from "./icons";

export function LanguageToggle({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const next: Locale = locale === "en" ? "hi" : "en";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-2 text-[0.8rem] font-medium text-muted transition duration-300 hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <IconGlobe className="h-[1.05rem] w-[1.05rem]" />
      <span lang={next} className="hidden sm:inline">
        {next === "hi" ? "हिंदी" : "English"}
      </span>
      <span lang={next} className="sm:hidden">
        {next === "hi" ? "हिं" : "EN"}
      </span>
    </button>
  );
}
