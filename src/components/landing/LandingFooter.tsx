import Link from "next/link";
import type { Messages } from "@/lib/i18n";

export function LandingFooter({ m }: { m: Messages }) {
  return (
    <footer className="mx-auto w-full max-w-7xl px-5 pb-4 md:px-10 md:pb-6">
      <div className="flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
        <p>{m.common.notDiagnosis}</p>
        <Link
          href="/privacy"
          className="underline-offset-4 transition hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
        >
          {m.common.privacyNotice}
        </Link>
      </div>
    </footer>
  );
}
