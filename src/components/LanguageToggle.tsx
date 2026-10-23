"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";

export function LanguageToggle({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const next: Locale = locale === "en" ? "hi" : "en";

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      className="min-h-10 rounded-lg px-3 text-sm font-medium hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span lang={next}>{next === "hi" ? "हिंदी" : "English"}</span>
    </button>
  );
}
