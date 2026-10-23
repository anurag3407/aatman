# Deployment

Aatman runs on a single VPS with Docker Compose, and scales out from there without code changes.

```
            internet
               │ 80/443 (only open ports, besides SSH)
        ┌──────▼──────┐
        │    Caddy    │  automatic HTTPS (Let's Encrypt), HTTP/3, gzip/zstd, 1 MB body cap
        └──────┬──────┘  least-connections over every replica, retries while one drains
     ┌─────────┼─────────┐
 ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
 │ app 1 │ │ app 2 │ │ app N │  stateless Next.js replicas (APP_REPLICAS), read-only FS, non-root
 └───┬───┘ └───┬───┘ └───┬───┘
     └─────────┼─────────┘   internal network: no route to the internet
        ┌──────▼──────┐   ┌──────┐
        │  Postgres   │◄──┤ cron │  retention 03:00 IST, pg_dump 02:30 IST → /opt/aatman/backups
        └─────────────┘   └──────┘
```

Files: [`deploy/compose.yaml`](../deploy/compose.yaml), [`deploy/Caddyfile`](../deploy/Caddyfile), [`deploy/.env.example`](../deploy/.env.example) (every setting), [`deploy/scripts/`](../deploy/scripts).

## Why it scales

Every app replica is interchangeable, so adding capacity is a number in the settings file:

- **Sessions** are signed cookies (JWT) and OIDC login state is a signed, short-lived cookie: any replica can serve any request.
- **Rate limits** live in Postgres (`rate_limits`, one atomic upsert per call), so a limit holds across all replicas.
- **No shared page cache is needed**: every personalised page is rendered per request; only `/crisis` and icons are static and they're baked into the image.
- **Version skew**: each build gets `NEXT_DEPLOYMENT_ID` = release id. During a rolling deploy, a browser holding the old version hard-reloads instead of calling Server Functions that no longer exist.
- **Server Function encryption key** is generated per build; all replicas run the same image, so they share it.

## Pick a VPS

- **India region** (DPDP; see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)): e.g. AWS Lightsail Mumbai, DigitalOcean Bangalore, Azure Central India, E2E Networks, or the institute's own data centre.
- **Ubuntu 24.04**, **2 vCPU / 4 GB RAM** minimum (the image builds on the server; the bootstrap adds 2 GB swap). 4 vCPU / 8 GB for comfort at full-campus scale.
- 40 GB+ disk (images, Postgres, 14 days of backups).

## First deploy

1. **DNS**: point an A (and AAAA, if any) record for the domain, e.g. `aatman.nitp.ac.in`, at the VPS. Caddy needs this to get a certificate.
2. **Prepare the server** (as root, once; your SSH key must already be on root):
   ```bash
   ssh root@<vps-ip> 'bash -s' < deploy/scripts/bootstrap-vps.sh
   ```
   Installs Docker, creates the `deploy` user with your key, firewall (22/80/443 only), fail2ban, automatic security updates, swap, and turns off SSH password login.
3. **Create the settings file** (ships the code, generates every secret, then stops):
   ```bash
   deploy/deploy.sh deploy@<vps-ip> aatman.nitp.ac.in you@nitp.ac.in
   ```
4. **Fill in the rest** on the server: SSO, staff emails, and optionally the LLM.
   ```bash
   ssh deploy@<vps-ip> nano /opt/aatman/shared/.env
   ```
   - **Google Workspace:** Cloud Console → OAuth client (Web), user type **Internal**. Redirect URI `https://<domain>/api/auth/callback/google`.
   - **Microsoft Entra:** App registration, **single tenant**. Redirect URI `https://<domain>/api/auth/callback/microsoft`. Set `MICROSOFT_TENANT_ID`.
   - **Copy this file somewhere safe off the server** (a password manager), separately from DB backups. Losing `PSEUDONYM_KEY` or `DATA_ENCRYPTION_KEY` makes every record unreadable; leaking them with a backup exposes data.
5. **Deploy**:
   ```bash
   deploy/deploy.sh deploy@<vps-ip>
   ```
   Then check `https://<domain>/api/health` → `{"ok":true}`.

## Every later deploy

Commit, then:

```bash
deploy/deploy.sh deploy@<vps-ip>
```

Only the last commit is shipped (`git archive HEAD`), never your working tree or `.env.local`. On the server, [`release.sh`](../deploy/scripts/release.sh):

1. checks the settings (refuses an empty secret, `DEV_LOGIN=true`, no SSO, `APP_URL ≠ https://DOMAIN`);
2. builds `aatman-app:<release>` and `aatman-migrate:<release>`;
3. applies migrations;
4. starts `APP_REPLICAS` new replicas next to the old ones, waits until **all** pass `/api/health`, then stops the old ones with a 30 s drain. If a new replica fails, it's removed, the old ones keep serving, and its logs are printed;
5. keeps the last five releases and images for rollback.

**Rollback:** `ssh deploy@<vps> /opt/aatman/releases/<older-release>/deploy/scripts/release.sh <older-release>` (`ls /opt/aatman/releases`, or `cat /opt/aatman/releases.log`). Migrations only go forward: roll back only to a release that works with the current schema.

## Scaling up

| Load | Change |
|---|---|
| More traffic on the same VPS | Raise `APP_REPLICAS` (≈ 1 per vCPU) and redeploy. Keep `APP_REPLICAS × DATABASE_POOL_MAX + 5 < PG_MAX_CONNECTIONS` |
| Bigger VPS | Resize, then raise `PG_SHARED_BUFFERS` (25% of RAM), `PG_EFFECTIVE_CACHE_SIZE` (~50–75%), `PG_MEMORY_LIMIT`, `APP_MEMORY_LIMIT` |
| Database outgrows the box, or you want managed backups/HA | Move to a managed India-region Postgres: `pg_dump`/`pg_restore` into it, set `DATABASE_URL=postgres://…?sslmode=require`, clear `COMPOSE_PROFILES`, redeploy |
| More than one VPS | With the database external, run this same stack on each app VPS (same `.env`), and put a load balancer (or DNS round-robin) in front. Nothing else changes: sessions, rate limits and deployment ids already work across hosts. Terminate TLS at the load balancer, or keep Caddy on each host |

Rough capacity: one replica on one vCPU comfortably handles the whole campus checking in; the LLM provider (if enabled) is the usual bottleneck, not the app.

## Operating it

All commands on the VPS, from `/opt/aatman/current/deploy`:

```bash
docker compose ps                         # status and health of every container
docker compose logs -f app                # app logs (error types only, never student data)
docker compose logs cron                  # retention and backup runs
docker compose exec postgres psql -U aatman aatman
docker compose run --rm migrate           # apply migrations by hand
```

- **Backups**: `pg_dump` nightly into `/opt/aatman/backups`, kept `BACKUP_KEEP_DAYS` days. **Copy them off the server**, e.g. from another machine:
  `rsync -a deploy@<vps>:/opt/aatman/backups/ ./aatman-backups/`. Answers and summaries in a dump are field-encrypted; tiers and timestamps are not.
- **Restore**: `scripts/restore.sh /opt/aatman/backups/aatman-<stamp>.dump` (asks before replacing data). Test a restore before launch.
- **Retention** runs daily via the cron container. To run it now:
  `docker compose exec cron sh -c '. /run/cron.env; sh /opt/cron/retention.sh'`.
- **Monitoring**: an external uptime check on `https://<domain>/api/health` (UptimeRobot, Better Stack…). It returns 503 if the database is unreachable.
- **TLS** certificates renew automatically; they live in the `caddy_data` volume.
- **Logs** contain error types and status codes only, never request bodies, answers or chat text. Caddy writes no access log and Postgres never logs statement text. Keep it that way: don't add request logging.

## Behind an existing reverse proxy

If the institute already terminates TLS (nginx, a campus load balancer), drop the `caddy` service and proxy to the app replicas on port 3000 over the `edge` network, or publish one replica's port. Pass the original `Host`, don't buffer responses (`proxy_buffering off`), cap the body at 1 MB, and keep `APP_URL` as the public `https://` URL.

## The app refuses to start in production if

- `DEV_LOGIN=true`, or `LLM_PROVIDER=mock`
- `DATABASE_URL` is PGlite (unless `ALLOW_PGLITE_IN_PRODUCTION=true`, meant only for CI)
- no SSO provider is configured
- `CRON_SECRET` is missing
- a secret is shorter than required or the encryption key isn't 32 bytes

## LLM options

| `LLM_PROVIDER` | Data leaves your infra? | Notes |
|---|---|---|
| `none` | No | Templates only. The app is fully functional; reflective chat is hidden |
| `anthropic` | Yes (scores, or scrubbed chat text) | Default model `claude-opus-5-5`, low effort. Needs a **zero-data-retention** agreement. Server-side refusal fallback is on (`LLM_REFUSAL_FALLBACK=false` to disable) |
| `openai_compat` | No, if self-hosted | Any `/chat/completions` server (vLLM, Ollama). Set `OPENAI_COMPAT_BASE_URL` and `LLM_MODEL`. Run the red-team set against your model before launch |

## Without the scripts

The images work on any container host:

```bash
docker build -t aatman .                                  # app
docker build --target migrate -t aatman-migrate .         # migrations
docker run --rm --env-file prod.env aatman-migrate        # release step, before rollout
docker run -d -p 3000:3000 --env-file prod.env aatman
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/retention   # daily
```

The service worker (`public/sw.js`) only caches `/crisis`, the exercise pages and static assets. Bump `CACHE` in it when changing caching behaviour.
