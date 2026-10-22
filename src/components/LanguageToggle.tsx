"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";

export function LanguageToggle({ locale, label, className }: { locale: Locale; label: string; className?: string }) {
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
      className={`min-h-10 rounded-md px-3 text-sm font-medium focus-visible:outline-2 ${
        className ?? "hover:bg-accent-soft focus-visible:outline-accent"
      }`}
    >
      <span lang={next}>{next === "hi" ? "हिंदी" : "English"}</span>
    </button>
  );
}
