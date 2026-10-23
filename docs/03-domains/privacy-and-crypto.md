# Privacy and crypto

## Design claim

A full database dump should reveal tiers, timestamps, and staff operational metadata — not
who a student is, what they answered, what they wrote, or how to contact them.

This document explains how that claim is enforced and where its limits are.

## Data inventory

| Data | Stored? | Form | Who can read |
|---|---|---|---|
| Student email | **No** | HMAC pseudonym at sign-in | Nobody after sign-in |
| Pseudonym | Yes | `p_` + base64url HMAC-SHA256 | App; DB operators |
| Answers, scores, triage details | Yes | AES-256-GCM (`checkins.payload_enc`) | Student; counsellor via opt-in |
| Tier, timestamps | Yes | Plaintext | Staff; admin as aggregates |
| AI/template summary | Yes | AES-256-GCM (`summary_enc`) + source enum | Student; counsellor via opt-in |
| Free text | **No** | Scanned in memory, dropped | Nobody |
| Chat transcript | **No** | Browser memory only | Nobody |
| Contact details | Yes, if submitted | AES-256-GCM (`contact_requests.contact_enc`) | Counsellors (audited) |
| Booking phone | Yes, if provided | AES-256-GCM (`slots.contact_enc`) | Counsellors (audited) |
| Shared check-in pointer | Yes | UUID | Counsellors for that booking |
| Crisis alert | Yes | Pseudonym, tier, timestamps, encrypted note | Counsellors (audited) |
| Audit log | Yes | Actor, action, ids | Operators |
| Notification outbox | Yes | Staff email, opaque alert id | Operators |
| Rate-limit counters | Yes | SHA-256 hashed key | Operators |
| Counsellor profile | Yes | Staff name, languages, bio | Students (public directory) |
| Staff email | Session + audit | Plain | Operators |

Retention windows are in [Retention and erasure](retention-and-erasure.md).

## Pseudonymisation

```ts
pseudonymFor(email, key) =
  "p_" + base64url(HMAC-SHA256(key, email.trim().toLowerCase()))
```

Source: `src/lib/privacy/pseudonym.ts`.

Why HMAC, not SHA-256:

- Institute emails and roll numbers are guessable. An unkeyed hash of
  `student@nitp.ac.in` can be brute-forced or precomputed.
- The key makes recomputation impossible without the secret.
- The result is stable, so a student's history follows them across sessions.

What it is **not**:

- Not anonymous. It is pseudonymous. Anyone with `PSEUDONYM_KEY` and a candidate email can
  confirm a match.
- Not reversible from the database alone.

Operational consequence: **losing or rotating `PSEUDONYM_KEY` orphans every account.** Unless
you retain the old key to compute the old pseudonym, existing rows become unreachable to the
student. Treat it as a long-lived key and back it up separately from the database.

## Field encryption

Source: `src/lib/privacy/fieldCrypto.ts`.

```text
format: v1.<base64url(iv[12] | ciphertext | tag[16])>
algorithm: AES-256-GCM
key: 32 bytes from DATA_ENCRYPTION_KEY (base64)
AAD: owner's pseudonym (UTF-8)
```

Encryption:

1. Random 12-byte IV.
2. AES-256-GCM with the decoded key.
3. AAD = owner pseudonym.
4. Concatenate IV + ciphertext + 16-byte tag.
5. Base64url encode; prefix `v1.`.

Decryption:

1. Split `v1.` and body; reject unknown versions.
2. Slice IV, ciphertext, tag.
3. Set AAD and tag; decrypt.
4. Parse JSON.

Properties:

- **Confidentiality:** without the key, ciphertext is opaque.
- **Integrity:** GCM tag detects tampering.
- **Owner binding:** copying a ciphertext to another student's row changes the AAD and causes
  authentication failure. This blocks a class of "ciphertext transplant" attacks by an
  operator or bug.
- **Fresh IV:** identical plaintexts produce different ciphertexts.
- **Versioning:** `v1` allows a future algorithm/key migration.

### Sealed fields

| Column | Contents |
|---|---|
| `checkins.payload_enc` | `{ answers (without freeText), campus, triage (PublicTriage), locale }` |
| `checkins.summary_enc` | Summary text string |
| `contact_requests.contact_enc` | `{ name?, phone?, email?, bestTime? }` |
| `slots.contact_enc` | `{ phone }` |
| `crisis_alerts.note_enc` | Resolution note string |

### Plaintext fields and why

| Field | Reason |
|---|---|
| `tier` | Weekly aggregates and routing; no item-level content |
| `created_at` | History ordering, retention, aggregates |
| `status` enums | Queue and escalation logic |
| `slot` times/location/mode | Scheduling; no clinical content |
| `pseudonym` | Ownership/FK |
| audit target ids | Access attribution |
| outbox recipient/subject/body | Delivery; body is PII-free by contract |
| rate-limit key hash | Correctness across replicas |

## Free text handling

1. Free text is optional and at most 4000 characters.
2. `triage()` calls `detectCrisisInAll([freeText])`.
3. The result affects tier and ragging flag.
4. `createCheckin` destructures it out:

```ts
const { freeText, ...answers } = input.answers;
```

5. Only `answers` without free text is sealed.
6. The text is not logged, sent to an LLM, or written anywhere.

Consequence: staff cannot read what the student wrote. This is a deliberate product trade-off
for trust and data minimisation. The structured items and C-SSRS carry the clinical signal.

## Chat handling

- Transcript is React state; no server storage.
- Client-side detection before sending.
- Server-side detection over all user turns.
- PII scrub before the provider.
- Provider receives no identity, scores, or check-in data.
- Output guard before display.
- Provider retention is a vendor choice; use zero-retention terms or self-host.

## PII scrubbing

Source: `src/lib/privacy/piiScrub.ts`.

| Pattern | Replacement | Notes |
|---|---|---|
| Emails | `[email]` | Standard address shape |
| URLs / `www.` | `[link]` | |
| Indian phone numbers | `[phone]` | +91, 0-prefixed, 10-digit starting 6–9 |
| Long IDs | `[id]` | 6+ digits, optional letters |
| Room/flat/block/wing numbers | `[room]` | |
| "my name is…", "mera naam…" | `[name]` | |
| Names after titles/relationship words | `[name]` | Only capitalised following words |
| Name before sir/ma'am/ji/bhaiya/didi | `[name]` | |
| `HOSTEL_NAMES` | `[hostel]` | Configurable |

This is heuristic. It does not catch every free-form name or indirect identifier. The
compensating controls are ephemerality and provider terms. Any new data field sent to an LLM
requires updating this function and the data inventory.

## Consent

- `CONSENT_VERSION` gates saved student actions.
- Consent is recorded on the `students` row (`consent_version`, `consent_at`).
- `requireApi(..., { consent: true })` returns 403 `consent_required` for stale consent.
- The consent page explains storage in plain language and asks age first.
- Under-18s are routed to stateless mode.
- Consent copy lives in `src/messages/*.ts` and is versioned with the code.

Consent is not a substitute for the other controls; it is the legal/ethical layer on top of
technical minimisation.

## DPDP-style rights

| Right | Implementation |
|---|---|
| Access | `GET /api/me/export` returns decrypted JSON |
| Correction | Not implemented as an edit flow; a student can submit a new check-in or contact the cell. Erasure is available. |
| Erasure | `DELETE /api/me` transaction + cascade |
| Grievance | Human process; contact details must be published by the institute |
| Consent withdrawal | Erasure is the practical withdrawal for stored data; stateless mode avoids collection |

Export includes account metadata, check-ins, contact requests, and bookings. It does not
include alert resolution notes (staff-authored) or audit rows.

## Key management

| Key | Loss | Rotation | Storage |
|---|---|---|---|
| `PSEUDONYM_KEY` | Accounts orphaned | Avoid; needs migration/re-linking | Server env / secrets manager |
| `DATA_ENCRYPTION_KEY` | Content unreadable | Needs re-encryption migration | Server env / secrets manager |
| `SESSION_SECRET` | Sessions invalid | Safe | Server env |
| `CRON_SECRET` | Jobs 401 | Safe with scheduler update | Server env |
| SSO secrets | Login fails | IdP + app together | Server env |

Rules:

- Never commit keys. `.env.local` is gitignored; server env is mode 0600.
- Never include keys in database backups. A dump plus keys is a full breach.
- Store a copy of the keys in a separate, access-controlled secret store; losing
  `DATA_ENCRYPTION_KEY` is unrecoverable.
- Key rotation for encryption requires decrypting and re-encrypting every sealed field with a
  new version; there is no automatic re-encryption job in this codebase.

## What a database dump reveals

| Revealed | Not revealed |
|---|---|
| Number of students (pseudonyms) | Email/name/roll number |
| Check-in timestamps | Answers, scores, summaries |
| Tier per check-in | Free text |
| Alert tiers/timestamps/status | Contact details |
| Slot schedule and booking ownership pseudonyms | Chat |
| Staff emails in audit/outbox | Resolution notes (encrypted) |
| Rate-limit counters (hashed) | — |

An attacker with the dump but no keys can still learn that a pseudonym had a `crisis`
check-in at a time. That is a metadata leak. It is accepted to enable aggregates and
operations; the alternative (encrypting tier/time) would require a separate aggregate store.

## Residual risks

| Risk | Reality |
|---|---|
| Root operator can decrypt | Holds keys; privacy protects against dumps and accidents, not malicious root |
| Metadata leak | Tier/timestamps visible in a dump |
| Correlation via booking | A counsellor who knows a student's schedule could infer identity from a booking; access is audited |
| Small-cell inference | Aggregates suppress <10, but repeated queries over time can still narrow; do not expose ad-hoc queries |
| PII scrub misses | Heuristic; provider terms and ephemerality compensate |
| Lost key | Unrecoverable by design; backups must include a key escrow decision |
| Browser storage | Draft/result in `sessionStorage` on a shared device; quick exit clears it |
| Service worker cache | Exercises/crisis page remain cached; no answers cached |

## Verification

Tests (`tests/privacy/privacy.test.ts`):

- Pseudonym stable, case-insensitive, key-dependent, does not contain the email.
- Encryption round-trips; fresh IV each time.
- Ciphertext moved to another owner fails.
- Wrong key / tampered data fails.
- Hostel names scrubbed; ordinary text unchanged.

Service tests (`tests/services/services.test.ts`):

- Server re-scores and ignores client claims.
- Answers stored encrypted; free text never stored.
- One student cannot see another's check-in.

## Related reading

- [privacy-and-security.md](../privacy-and-security.md)
- [Security architecture](../01-architecture/security-architecture.md)
- [Data flow](../01-architecture/data-flow.md)
- [Retention and erasure](retention-and-erasure.md)
- [db.md](../04-data/db.md)
