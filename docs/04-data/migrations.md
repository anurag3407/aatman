# Migrations

## Tooling

| Tool | Role |
|---|---|
| `drizzle-kit` | Generates SQL migrations from the TypeScript schema |
| `drizzle-orm` migrator | Applies migrations at runtime (PGlite) or via script (Postgres) |
| `scripts/migrate.mjs` | Production migration runner for `postgres://` URLs |
| `drizzle/meta/_journal.json` | Ordered migration journal |
| `drizzle/meta/*_snapshot.json` | Schema snapshots used by the generator |

Commands:

```bash
pnpm db:generate     # drizzle-kit generate → new SQL + snapshot + journal entry
pnpm db:migrate      # node scripts/migrate.mjs → apply to DATABASE_URL (Postgres only)
```

## Current history

| # | Tag | What it introduced |
|---|---|---|
| 0000 | `0000_init` | `students`, `checkins`, `contact_requests`, `slots`, `audit_log`; FKs and indexes |
| 0001 | `0001_rate_limits` | `rate_limits` table + window index |
| 0002 | `0002_clammy_mentallo` | `crisis_alerts`, `notification_outbox`, `on_call_shifts`; FKs/indexes |
| 0003 | `0003_demonic_the_fallen` | `counsellors` table; slot priority, reminder, attendance, `marked_by` columns |

Tags 0002/0003 are Drizzle's random generated names; they are not semantic. Do not rename
applied migrations.

### What each migration does

**0000_init**

- Creates the five core tables.
- Adds foreign keys:
  - check-ins/contact requests → students (cascade)
  - contact requests → check-ins (set null)
  - slots → students (set null), slots → check-ins (set null)
- Adds indexes for owner/time lookups and the queue.

**0001_rate_limits**

- Fixed-window counters keyed by a hashed string.
- `window_start` as `bigint` epoch milliseconds.
- Index for the sweep.

**0002_clammy_mentallo**

- `crisis_alerts` with pointer fields, status, escalation, encrypted note.
- `notification_outbox` with delivery state, attempts, backoff time.
- `on_call_shifts` with role and backup email.
- FKs to students/check-ins/contact requests with cascade or set null.
- Open-alert, pseudonym, due-outbox, and on-call window indexes.

**0003_demonic_the_fallen**

- `counsellors` public profile table.
- Adds to `slots`: `is_urgent`, `reminder_opt_in`, four reminder timestamps,
  `attended_at`, `no_show_at`, `marked_by`.

## How migrations run by environment

### Local development (PGlite)

`getDb()` connects and immediately runs `migrate(db, { migrationsFolder: "drizzle" })`.
No manual step. This is convenient but means a schema change is applied on the next server
start.

### Unit/integration tests (PGlite in-memory)

Vitest sets `DATABASE_URL=pglite:memory`; each test file gets its own database with migrations
applied. Migrations are therefore exercised by the test suite.

### VPS production (Postgres)

The release pipeline:

```text
docker compose build app migrate
docker compose up -d postgres caddy cron
docker compose run --rm migrate      ← scripts/migrate.mjs
start new app replicas
wait for healthy
drain old replicas
```

Implications:

- Migrations run **before** new code.
- Old replicas keep serving during the migration, so migrations must be backward-compatible
  with the previous release.
- A failed migration aborts the release; old replicas remain.
- Migrations are forward-only. Rolling back code to a release that expects an older schema is
  only safe if the schema changes are additive/backward-compatible.

### Render / PaaS

`scripts/start.sh` runs `node scripts/migrate.mjs` at container start when `DATABASE_URL` is a
`postgres://` URL. With multiple instances, concurrent migration attempts are possible;
Postgres advisory locks in Drizzle's migrator serialize them, but a dedicated release step is
preferable.

## Writing a migration

1. Edit `src/lib/db/schema.ts`.
2. Run `pnpm db:generate`.
3. Review the generated SQL in `drizzle/<NNNN>_*.sql`. Drizzle does not understand intent.
4. Consider production safety (see below).
5. Run `pnpm test` (PGlite applies migrations).
6. Run `pnpm typecheck` and update services.
7. Update `docs/04-data/db.md` and `erd-and-data-model.md`.
8. Commit schema, SQL, snapshot, and journal together.

### What `db:generate` produces

```text
drizzle/
  0004_<random_name>.sql
  meta/
    0004_snapshot.json
    _journal.json   ← new entry appended
```

Never hand-edit `_journal.json` or snapshots. Never edit an applied migration.

## Production-safe migration rules

| Change | Safe? | Approach |
|---|---|---|
| Add nullable column | ✅ | Deploy, backfill, then enforce |
| Add column with default | ✅ (PG 11+) | Fast default; still consider lock time |
| Add index | ⚠️ | Use `CREATE INDEX CONCURRENTLY` manually for large tables |
| Add table | ✅ | |
| Add FK | ⚠️ | Validates existing rows; large tables need `NOT VALID` then validate |
| Rename column | ❌ direct | Add new, dual-write/backfill, switch reads, drop old |
| Drop column | ❌ with old code | Stop reading first; drop in a later release |
| Change type | ❌ direct | Add new column, backfill, switch, drop old |
| Tighten NOT NULL | ⚠️ | Backfill first |
| Drop table | ❌ with old code | Remove code in one release, drop in the next |

The rolling deploy keeps old replicas alive briefly. A migration that removes a column the old
code still reads will break those replicas.

### Large-table operations

At pilot scale (thousands of rows), most operations are fast. If check-ins grow:

- `CREATE INDEX CONCURRENTLY` avoids write locks but cannot run inside a transaction; the
  Drizzle migrator wraps migrations in a transaction. Run it manually as an operator step.
- Batch backfills in chunks.
- Avoid rewriting `payload_enc` unless changing encryption versions.

## Rollback

There are **no down migrations**. Rollback means:

1. Deploy an older application release.
2. Ensure the current schema is compatible with that release.
3. If a migration was destructive and incompatible, restore from backup (destructive; requires
   downtime and confirmation).

The release script keeps the five newest release directories and images for code rollback.

`deploy/scripts/restore.sh` restores a dump into the bundled Postgres with
`pg_restore --clean --if-exists --single-transaction` after typing `restore`. It destroys
current data. Stop traffic during a restore.

## Verifying a migration

```bash
# Apply locally
DATABASE_URL=pglite:./.data/pglite pnpm dev   # auto-migrates

# Apply to a real Postgres
DATABASE_URL=postgres://… pnpm db:migrate

# Inspect
psql "$DATABASE_URL" -c '\dt'
psql "$DATABASE_URL" -c '\d+ checkins'
psql "$DATABASE_URL" -c 'select * from drizzle.__drizzle_migrations;'
```

Drizzle records applied migrations in `drizzle.__drizzle_migrations`.

A migration is applied once per database; re-running is a no-op.

## Failure handling

| Failure | Effect | Recovery |
|---|---|---|
| SQL syntax/type error | Migration aborts; release stops | Fix migration locally, regenerate, redeploy |
| Lock timeout | Migration aborts | Retry in a low-traffic window; inspect blockers |
| Constraint violation on backfill | Aborts | Fix data or make constraint `NOT VALID` |
| Partial migration | Drizzle wraps in a transaction for Postgres; abort rolls back | Retry |
| Migration succeeds, app fails health | New replicas removed; old keep serving | Inspect logs; roll back code |
| Concurrent migrators (PaaS) | Advisory lock serializes; one waits/fails | Prefer a release step |

## Destructive-change checklist

Before merging a migration that drops/renames/retightens:

- [ ] Search the codebase for every column/table reference.
- [ ] Confirm no old release in the rollback window reads it.
- [ ] Back up production (`pg_dump`).
- [ ] Test on a copy of production-like data.
- [ ] Announce a change window if downtime is possible.
- [ ] Have a restore plan and verify the dump is readable.
- [ ] Update db.md, ERD, services, and tests in the same PR.

## Encryption and key migrations

Changing `DATA_ENCRYPTION_KEY` or the cipher format is not a Drizzle migration. It requires:

1. A new version prefix (e.g. `v2`).
2. A backfill job that decrypts with the old key and re-encrypts with the new key, row by row.
3. Dual-read support during the transition.
4. A decision about rows that cannot be decrypted (lost key → unrecoverable).

The current code only understands `v1`. Adding a version requires changes in
`fieldCrypto.ts`, not just SQL.

## Related reading

- [db.md](db.md)
- [deployment.md](../deployment.md)
- [Runbook](../06-operations/runbook.md)
- [Configuration](../06-operations/configuration.md)
