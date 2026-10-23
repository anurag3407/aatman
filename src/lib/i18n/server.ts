import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale, messagesFor, type Locale, type Messages, LOCALE_COOKIE } from "./index";

/** Cookie first, then the browser's Accept-Language, then English. */
export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^\s*hi\b/i.test(accept) ? "hi" : "en";
}

export async function getMessages(): Promise<{ locale: Locale; m: Messages }> {
  const locale = await getLocale();
  return { locale, m: messagesFor(locale) };
}
