"use client";

import { createContext, useContext, type ReactNode } from "react";
import { messagesFor, type Locale, type Messages } from "./index";

const I18nContext = createContext<{ locale: Locale; m: Messages } | null>(null);

/** Only the locale crosses the server/client boundary; both catalogs ship in the client bundle. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, m: messagesFor(locale) }}>{children}</I18nContext.Provider>;
}

export function useI18n(): { locale: Locale; m: Messages } {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
