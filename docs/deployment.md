# Deployment

## Shape

- One stateless Next.js container (`Dockerfile`, standalone output, non-root, health check on `/api/health`).
- Managed Postgres in an **India region** (e.g. AWS RDS `ap-south-1`, Azure Database for PostgreSQL Central India).
- HTTPS on an institute domain (e.g. `aatman.nitp.ac.in`). HSTS and CSP are sent in production.

## Steps

1. **Database:** create Postgres 15+ and set `DATABASE_URL=postgres://…?sslmode=require`.
2. **Secrets:** use your secrets manager (see `.env.example`).
   ```bash
   openssl rand -base64 48   # SESSION_SECRET, PSEUDONYM_KEY
   openssl rand -base64 32   # DATA_ENCRYPTION_KEY
   openssl rand -hex 32      # CRON_SECRET
   ```
   Store `PSEUDONYM_KEY` and `DATA_ENCRYPTION_KEY` **separately from DB backups**. Losing them makes every record unreadable; leaking them along with a backup exposes data.
3. **SSO**
   - **Google Workspace:** Cloud Console → OAuth client (Web), user type **Internal**. Redirect URI: `https://<domain>/api/auth/callback/google`.
   - **Microsoft Entra:** App registration, **single tenant**. Redirect URI: `https://<domain>/api/auth/callback/microsoft`. Set `MICROSOFT_TENANT_ID`.
   - The server verifies the Google `hd` claim / Entra `tid` and the email domain on every login.
4. **Build and migrate**
   ```bash
   docker build -t aatman .
   docker run --rm --env-file prod.env aatman node scripts/migrate.mjs   # release step, before rollout
   docker run -d -p 3000:3000 --env-file prod.env aatman
   ```
5. **Retention job:** run daily.
   ```bash
   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/retention
   ```
6. **Monitoring:** uptime check on `/api/health`. Logs contain error types and status codes only, never request bodies, answers or chat text. Keep it that way: don't add request logging middleware.

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

## Scaling notes

- The rate limiter is in-memory per instance. With more than one instance, use sticky sessions or accept per-instance limits.
- The service worker (`public/sw.js`) only caches `/crisis`, the exercise pages and static assets. Bump `CACHE` in it when changing caching behaviour.
