/**
 * Removes obvious identifiers before free text reaches an LLM: emails, phone numbers,
 * roll/ID numbers, URLs, room numbers, hostel names and names after titles or
 * relationship words ("Sharma sir", "my roommate Rahul").
 *
 * This is a heuristic, not NER. It catches the common patterns, and the chat UI also asks
 * students not to use names. Anything that slips through still goes only to a
 * zero-retention provider, never to storage.
 */

export interface ScrubOptions {
  /** Lowercase hostel or block names, e.g. from the HOSTEL_NAMES env var. */
  hostelNames?: readonly string[];
}

// Titles match in any case ("Prof.", "prof"), but only a Capitalised following word counts as a name,
// so "my friend said" is left alone.
const TITLE_BEFORE =
  /\b(prof|professor|dr|mr|mrs|ms|miss|sir|madam|maam|senior|junior|roommate|room\s*mate|friend|bf|gf|boyfriend|girlfriend|warden|hod|dean|bhaiya|bhai|didi|uncle|aunty)\.?\s+([A-Za-z]{3,})(\s+[A-Za-z]{3,})?/gi;
const isCapitalised = (w: string) => /^[A-Z][a-z]/.test(w);
const TITLE_AFTER = /\b([A-Z][a-z]{2,})\s+(sir|maam|ma'am|madam|ji|bhaiya|bhai|didi)\b/g;
const MY_NAME = /\b(my name is|i am called|mera naam)\s+([A-Za-z]{2,})(\s+[A-Za-z]{2,})?/gi;

export function scrubPii(text: string, opts: ScrubOptions = {}): string {
  let out = text
    .replace(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, "[email]")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link]")
    // +91 / 0-prefixed / bare 10-digit Indian numbers, with optional separators.
    .replace(/(\+?91[\s-]?|\b0)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, "[phone]")
    // Roll numbers and other long IDs (6+ digits, optionally with letters).
    .replace(/\b(?=[A-Za-z]*\d)[A-Za-z0-9]*\d{6,}[A-Za-z0-9]*\b/g, "[id]")
    .replace(/\b(room|rm|flat|block|wing)\s*(no\.?|number|#)?\s*[A-Za-z]?-?\d{1,4}[A-Za-z]?\b/gi, "[room]")
    .replace(MY_NAME, (_m, lead: string) => `${lead} [name]`)
    .replace(TITLE_BEFORE, (m: string, title: string, first: string, second?: string) => {
      if (!isCapitalised(first)) return m;
      const rest = second && !isCapitalised(second.trim()) ? second : "";
      return `${title} [name]${rest}`;
    })
    .replace(TITLE_AFTER, (_m, _name: string, title: string) => `[name] ${title}`);

  for (const hostel of opts.hostelNames ?? []) {
    if (!hostel) continue;
    const escaped = hostel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[hostel]");
  }
  return out;
}
