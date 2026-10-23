# Privacy and security

A short data-protection overview for the DPO and ethics committee.

## Data inventory

| Data | Stored? | Form | Who can read it | Retention |
|---|---|---|---|---|
| Student email | **No** | Becomes `HMAC-SHA256(PSEUDONYM_KEY, email)` at sign-in | Nobody | Not kept |
| Check-in answers, scores, AI note | Yes | AES-256-GCM per field, bound to pseudonym | The student; a counsellor only via student opt-in | 12 months, or until the student keeps or erases it |
| Tier and timestamp | Yes | Plaintext (needed for aggregates) | Admin, as weekly totals with k ≥ 10 | With the check-in |
| Free text in check-in | **No** | Scanned for crisis language in memory, then dropped | Nobody | Not kept |
| Reflective chat | **No** | Held in the browser; server scans, scrubs PII and forwards to the LLM, stores nothing | Nobody | Not kept |
| Contact request details (name, phone, email, best time) | Yes, if the student sends one | Encrypted | Counsellors (each view audit-logged) | Deleted 12 months after closing, or on erasure |
| Booking | Yes | Phone encrypted; check-in link only if shared | Counsellors | 12 months after the session |
| Audit log | Yes | Actor, action, record id (no content) | Operators | 36 months |
| Crisis alert | Yes | Pseudonym, tier, timestamps, resolution note (encrypted) | On-call counsellors; clinical lead for escalations; every view audited | 12 months after resolution |
| Notification outbox | Yes | Staff email, opaque alert id, no student data | Operators | 30 days after sent/dead |
| Counsellor profile | Yes | Staff name, languages, bio | Students (public directory) | Until removed |
| Appointment reminder | No new row | Phone decrypted in memory from the booking, used once, never written to the outbox | Nobody | Not stored |
| Staff email | In session cookie and audit log | Plain | Operators | Audit retention |

## Controls

- **Authentication:** institute SSO only. The Google `hd` claim / Entra tenant and domain are verified server-side. Sessions are signed, httpOnly, SameSite=Lax cookies with neutral names.
- **Authorisation:** roles come from server-side allow-lists. Students can access only their own rows (every query filters by pseudonym). Admins have no route to individual data.
- **CSRF:** every mutating route requires a same-origin `Origin` / `Sec-Fetch-Site`; JSON routes require `application/json`.
- **Headers:** CSP (no third-party origins), HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on APIs.
- **LLM boundary:** the summary receives scores and bands only. Chat text passes through the crisis detector, then PII scrubbing, then the model, then the output guard. Ragging and crisis text never reach the model.
- **Rights:** export (`/api/me/export`) and erasure (`DELETE /api/me`, which cascades and frees future bookings) are in Settings.
- **Minors:** under-18 mode creates no account, sends nothing, and keeps results only in the tab's sessionStorage.
- **Device privacy:** Quick exit (button, or Escape pressed twice) clears drafts and replaces the history entry. Reminders are calendar files titled "Check-in". The app name and manifest are neutral.
- **Alerting:** crisis/urgent alerts and their emails contain only an opaque id and severity, never answers, scores or contact details. Opening an alert is audited. The counsellor only sees callback details if the student separately sent a contact request.
- **SMS reminders:** the phone number stays encrypted at rest and is decrypted in memory per send. The message says "your appointment", never the app name, counsellor, location or clinical reason.

## Known limits

- PII scrubbing is a heuristic, not NER. Unusual names can slip through to a zero-retention LLM, but never into storage.
- The in-memory rate limiter is per instance.
- Pseudonymity, not anonymity: anyone holding `PSEUDONYM_KEY` plus the database could link an email to its data. Keep the key in a secrets manager, separate from backups.
