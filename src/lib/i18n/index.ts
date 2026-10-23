import en, { type Messages } from "@/messages/en";
import hi from "@/messages/hi";

export type { Messages };
export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "aat_lang";

const catalogs: Record<Locale, Messages> = { en, hi };

export function messagesFor(locale: Locale): Messages {
  return catalogs[locale];
}

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "hi";
}

/** Fills `{name}` placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** For `Intl` date formatting: Hindi uses the India locale with Devanagari month names. */
export function intlLocale(locale: Locale): string {
  return locale === "hi" ? "hi-IN" : "en-IN";
}

/** The campus is in India: format every date in IST so server and browser render the same text. */
export const TIME_ZONE = "Asia/Kolkata";

export function formatDate(value: string | Date, locale: Locale, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: TIME_ZONE }).format(new Date(value));
}
