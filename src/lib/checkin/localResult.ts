import type { PublicTriage } from "@/lib/services/checkins";
import type { CampusAnswers } from "./flow";

/**
 * Results kept only in this tab (sessionStorage): under-18 stateless mode, or a
 * check-in finished while offline. Never sent anywhere.
 */
export interface LocalResult {
  triage: PublicTriage;
  campus: CampusAnswers;
  createdAt: string;
  reason: "stateless" | "offline";
}

export const LOCAL_RESULT_KEY = "aat_result";
export const DRAFT_KEY = "aat_draft";

export function saveLocalResult(r: LocalResult) {
  try {
    sessionStorage.setItem(LOCAL_RESULT_KEY, JSON.stringify(r));
  } catch {
    // Private mode / blocked storage: the results page shows a fallback.
  }
}

export function loadLocalResult(): LocalResult | null {
  try {
    const raw = sessionStorage.getItem(LOCAL_RESULT_KEY);
    return raw ? (JSON.parse(raw) as LocalResult) : null;
  } catch {
    return null;
  }
}
