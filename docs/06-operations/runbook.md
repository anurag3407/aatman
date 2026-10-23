# Runbook

Day-2 operations for the reference VPS deployment. For first-time setup, see
[deployment.md](../deployment.md).

## Access and topology

```text
SSH:    deploy@<vps>           (key-only, in docker group)
Home:   /opt/aatman
        ├── current -> releases/<newest>   (symlink)
        ├── releases/<release-id>/         (five newest kept)
        ├── shared/.env                    (mode 0600)
        ├── shared/config/{Caddyfile,cron}
        └── backups/                       (14 days)
Stack:  docker compose -f deploy/compose.yaml (project `aatman`)
        caddy, app × APP_REPLICAS, postgres (optional), cron
Public: 80/443 only (plus SSH)
```

Useful aliases (run from `/opt/aatman/current/deploy`):

```bash
alias dc='docker compose --project-directory . -f compose.yaml'
dc ps
dc logs -f --tail=100 app
dc logs -f --tail=100 cron
dc exec postgres psql -U aatman -d aatman
curl -fsS https://$DOMAIN/api/health
```

## Daily checks (5 minutes)

| Check | Command / signal | Expected |
|---|---|---|
| Health | `curl -fsS https://$DOMAIN/api/health` | `{"ok":true}` |
| Containers | `dc ps` | caddy, app replicas, postgres, cron healthy/up |
| Cron logs | `dc logs --tail=50 cron` | alert/retention/backup lines, no repeated errors |
| Alert queue | Staff → Alerts | No open alert older than the tier ladder |
| Outbox depth | `SELECT status, count(*) FROM notification_outbox GROUP BY 1;` | No growing `pending`; no unexpected `dead` |
| Disk | `df -h /` | < 80% |
| Backups | `ls -lh /opt/aatman/backups` | A dump from the last 24 h |
| Cert | Browser/`curl -vI` | Valid, not near expiry (auto-renewed) |

## Weekly checks

- Review audit log for unexpected staff reads:
  `SELECT actor, action, count(*) FROM audit_log WHERE at > now() - interval '7 days' GROUP BY 1,2 ORDER BY 3 DESC;`
- Confirm retention ran: audit `retention_run` rows.
- Confirm on-call rota has coverage for the next 7 days.
- Verify an off-server backup copy exists and is readable.
- Check dependency advisories (`pnpm audit` or institute process).
- Review disk growth and `pg_stat_activity` idle transactions.

## Deploy a release

From the developer machine:

```bash
deploy/deploy.sh deploy@<vps>
```

What happens:

1. `git archive HEAD` is uploaded to `/opt/aatman/releases/<timestamp>-<sha>`.
   Uncommitted changes are not deployed.
2. First run only: creates `shared/.env` from the template and exits so you can fill it.
3. `release.sh`:
   - validates required settings;
   - builds `app` and `migrate` images tagged with the release;
   - starts Postgres/Caddy/cron;
   - reloads Caddy if its config changed;
   - runs migrations;
   - starts new app replicas alongside old ones;
   - waits for health (up to 180 s);
   - stops old replicas after new ones are healthy;
   - updates `current`, appends `releases.log`, prunes to five releases.

If new replicas fail health, they are removed and old ones keep serving.

### Manual deploy on the server

```bash
cd /opt/aatman/releases/<id>/deploy
./scripts/release.sh <id>
```

### Post-deploy verification

```bash
curl -fsS https://$DOMAIN/api/health
curl -fsSI https://$DOMAIN/crisis | head
dc logs --tail=50 app
```

Then smoke test in a browser: consent → dev/SSO sign-in (staging) → check-in → results →
`/crisis` offline.

## Rollback

### Code rollback

Deploy an older release:

```bash
ssh deploy@<vps>
ls -1t /opt/aatman/releases
/opt/aatman/releases/<older-id>/deploy/scripts/release.sh <older-id>
```

Migrations are forward-only. Only roll back to a release compatible with the current schema.

### Database restore

Destructive and requires downtime:

```bash
/opt/aatman/current/deploy/scripts/restore.sh /opt/aatman/backups/aatman-<stamp>.dump
# type: restore
```

The script uses `pg_restore --clean --if-exists --single-transaction`. Stop traffic or expect
errors while it runs. After restore, verify health and sign-in.

## Scheduled jobs

| Job | Schedule (UTC) | Script | Endpoint |
|---|---|---|---|
| Alerts + outbox + SMS | every minute | `deploy/cron/alerts.sh` | `POST /api/cron/alerts` |
| Retention | 21:30 (`03:00 IST`) | `deploy/cron/retention.sh` | `POST /api/cron/retention` |
| Backup | 21:00 (`02:30 IST`) | `deploy/cron/backup.sh` | `pg_dump` |

The cron container writes env to `/run/cron.env` and uses busybox crond. Logs go to
`docker compose logs cron`.

### If alerts are not being delivered

1. `dc logs --tail=100 cron` — look for `401`, connection errors, or missing env.
2. Confirm `CRON_SECRET` matches between app and cron.
3. `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://$DOMAIN/api/cron/alerts`.
4. Check outbox:

```sql
SELECT status, count(*) FROM notification_outbox GROUP BY 1;
SELECT id, kind, status, attempts, last_error, next_attempt_at
FROM notification_outbox
WHERE status IN ('pending','sending','dead')
ORDER BY created_at DESC LIMIT 20;
```

5. Confirm `NOTIFY_WEBHOOK_URL` is set in the app environment and reachable.
6. Check the staff alerts page for the "no email transport" warning.

A `dead` crisis notification means email delivery failed five times. Treat it as an incident:
check the dashboard, contact on-call by another channel, and consider manual outreach per SOP.

### If retention is not running

- Check the cron logs and the audit log for `retention_run`.
- Trigger manually and inspect counts.
- A zero count is normal on an empty system, but repeated zeros with known old data indicate a
  problem.

## Backup and restore

### What backups contain

- `pg_dump --format=custom` of the database.
- Ciphertext for all sealed fields.
- **No** `DATA_ENCRYPTION_KEY` or `PSEUDONYM_KEY`.
- Staff emails, alert metadata, audit ids.

A backup plus keys is a full breach; store them separately.

### Backup checks

```bash
ls -lh /opt/aatman/backups
pg_restore --list /opt/aatman/backups/aatman-<stamp>.dump | head
```

Copy dumps off-server (object storage, institute backup system). A backup on the same disk does
not survive losing the VPS.

### Restore drill

Quarterly: restore the newest dump into a scratch database, run `/api/health` against a
scratch app, and verify a known pseudonym's export. Never drill against production.

## Health and scaling

### Health endpoint

`GET /api/health` runs `SELECT 1`:

- 200 `{ok:true}` — healthy.
- 503 `{ok:false}` — database unreachable; Docker health check fails; Caddy stops routing.

### Scale replicas

Edit `APP_REPLICAS` in `shared/.env`, then:

```bash
dc up -d --no-deps --scale app=$APP_REPLICAS app
```

Keep `replicas × DATABASE_POOL_MAX + reserved < PG_MAX_CONNECTIONS`. Rough sizing: 1 replica
per vCPU, 300–500 MB RAM each under load.

### Database connections

```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY 2;
SHOW max_connections;
```

If exhausted, lower `DATABASE_POOL_MAX` or raise `PG_MAX_CONNECTIONS` within memory limits.

## Incident response

### Severity guide

| Severity | Examples | First action |
|---|---|---|
| SEV-1 | Suspected data breach; keys leaked; crisis alerts not reaching anyone | Contain, notify DPO/clinical lead, disable affected path |
| SEV-2 | Site down; database down; migrations failed; SSO broken | Restore service, then investigate |
| SEV-3 | Email delivery degraded; SMS not sending; admin dashboard wrong | Workaround + fix |
| SEV-4 | Cosmetic/UI bug; single-user issue | Normal backlog |

### Suspected breach

1. Preserve evidence: do not wipe logs or rotate keys before capturing relevant state.
2. Rotate `SESSION_SECRET` (invalidates sessions) and SSO client secret if implicated.
3. If `DATA_ENCRYPTION_KEY` or `PSEUDONYM_KEY` is compromised, assume all content is exposed;
   rotating the encryption key without re-encryption makes data unreadable. Escalate to the DPO
   before acting.
4. Disable dev login (already impossible in production) and review `ADMIN_EMAILS` /
   `COUNSELLOR_EMAILS`.
5. Review `audit_log` for unusual views.
6. Notify per the institute's legal/DPDP process. The app does not send breach notifications.

### Suspicious staff access

- Query audit rows for the actor and time window.
- Compare with the on-call rota and contact-request assignments.
- Preserve the rows; do not edit the audit table.
- Escalate to the DPO and the counselling cell lead.

### Database down

1. `dc ps`, `dc logs postgres`.
2. Check disk, memory, and `pg_isready`.
3. Restart the container if safe: `dc restart postgres`.
4. If corrupted, restore the newest dump (destructive).
5. App replicas return 503 until the database is reachable.

### Disk full

1. `df -h`, `du -sh /var/lib/docker/* /opt/aatman/*`.
2. Prune unused images carefully:
   `docker image prune -f` (release script already does this).
3. Remove old backups only after verifying off-server copies.
4. Rotate/compact container logs (`max-size` 10 MB, 5 files already configured).
5. Do not delete the current release or the `pgdata` volume.

### Certificate issues

Caddy renews automatically. If renewal fails:

- Confirm DNS points to the VPS.
- Confirm ports 80/443 are reachable.
- `dc logs caddy`.
- Check Let's Encrypt rate limits; the `caddy_data` volume must persist across deploys.

### SSO broken

- Confirm client ID/secret/tenant and redirect URIs.
- Check the IdP's sign-in logs.
- A `redirect_uri_mismatch` usually means `APP_URL` or the proxy host differs from the
  registered URI.
- Dev login is not available in production; have a break-glass plan (institute IT) before an
  SSO outage.

## Routine maintenance

| Task | Cadence | Notes |
|---|---|---|
| OS security updates | automatic | unattended-upgrades |
| Docker image rebuild | each release | Node base image updates come with rebuilds |
| Dependency updates | monthly/quarterly | Test, especially Next/React major versions |
| Rotate `SESSION_SECRET` | on suspicion | Signs everyone out |
| Review allow-lists | termly | Leavers removed from counsellor/admin |
| Review retention/consent copy | on policy change | Bump `CONSENT_VERSION` |
| Verify helpline numbers | each release | Tele-MANAS, 112, iCall, anti-ragging |
| Restore drill | quarterly | Scratch environment |
| Tabletop crisis drill | pre-launch and annually | Clinical lead + IT |

## Logs and privacy

Allowed in logs: error class/status, job counts, health failures, startup config errors,
development notification recipient/subject or last four phone digits.

Never add: request bodies, answers, free text, chat, contact details, tokens, SQL statement
text, or edge access logs with student paths/IPs.

Caddy is configured without an access log. Postgres suppresses statement text on errors.

## Escalation contacts

The software routes crisis alerts to on-call staff, but operational incidents need a human
contact list maintained outside the repo:

- On-call counsellor (rota in Staff → Alerts)
- Clinical lead (`CLINICAL_LEAD_EMAILS`)
- Institute IT / operator
- DPO
- Dean of Students

Keep this list current and accessible during an outage (an outage may take the app down).

## Related reading

- [deployment.md](../deployment.md)
- [Configuration](configuration.md)
- [Alerts and escalation](../03-domains/alerts-and-escalation.md)
- [Retention and erasure](../03-domains/retention-and-erasure.md)
- [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md)
