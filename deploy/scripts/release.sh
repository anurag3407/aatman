#!/usr/bin/env bash
# Builds and rolls out the release this script belongs to, on the VPS, with no downtime:
#   1. build the app and migration images (tagged with the release id)
#   2. start Postgres, Caddy and cron if they aren't running
#   3. apply migrations
#   4. start new app replicas next to the old ones, wait until every new one is healthy,
#      then stop the old ones (Caddy retries on a live replica while they drain)
# Usage (deploy/deploy.sh calls this): /opt/aatman/releases/<id>/deploy/scripts/release.sh <id>
# Rollback: run the release.sh of an older release. Migrations only go forward, so roll back
# only to a release whose code works with the current schema.
set -euo pipefail

release=${1:?usage: release.sh <release-id>}
base=${AATMAN_HOME:-/opt/aatman}
deploy_dir="$(cd "$(dirname "$0")/.." && pwd)"
shared_env="$base/shared/.env"
health_timeout=${HEALTH_TIMEOUT:-180}

cd "$deploy_dir"
export RELEASE="$release"
compose() { docker compose --project-directory "$deploy_dir" -f "$deploy_dir/compose.yaml" "$@"; }

# ── Settings ────────────────────────────────────────────────────────────────
if [[ ! -f "$shared_env" ]]; then
  echo "No settings file at $shared_env. Create it first:" >&2
  echo "  $deploy_dir/scripts/init-env.sh <domain> <acme-email>" >&2
  exit 2
fi
ln -sfn "$shared_env" "$deploy_dir/.env"

setting() { grep -E "^$1=" "$shared_env" | tail -n1 | cut -d= -f2-; }
problems=()
for key in DOMAIN ACME_EMAIL APP_URL DATABASE_URL SESSION_SECRET PSEUDONYM_KEY DATA_ENCRYPTION_KEY CRON_SECRET; do
  [[ -n "$(setting "$key")" ]] || problems+=("$key is empty")
done
[[ "$(setting APP_URL)" == "https://$(setting DOMAIN)" ]] || problems+=("APP_URL must be https://\$DOMAIN")
[[ "$(setting DOMAIN)" != *example* ]] || problems+=("DOMAIN is still the example value")
if [[ -z "$(setting GOOGLE_CLIENT_ID)" && -z "$(setting MICROSOFT_CLIENT_ID)" ]]; then
  problems+=("configure Google or Microsoft SSO (GOOGLE_* or MICROSOFT_*)")
fi
[[ "$(setting DEV_LOGIN)" != "true" ]] || problems+=("DEV_LOGIN must be false")
if (( ${#problems[@]} )); then
  echo "Fix $shared_env before deploying:" >&2
  printf '  - %s\n' "${problems[@]}" >&2
  exit 2
fi

replicas=$(setting APP_REPLICAS)
replicas=${replicas:-2}
backup_dir=$(setting BACKUP_DIR)
mkdir -p "${backup_dir:-$base/backups}"
# Mark this release as the newest, so cleanup below never removes it (also on rollback).
touch "$(dirname "$deploy_dir")"

# Caddy and cron mount their config from a path that stays the same across releases.
config_dir="$base/shared/config"
export CONFIG_DIR="$config_dir"
mkdir -p "$config_dir"
caddy_changed=0 cron_changed=0
cmp -s Caddyfile "$config_dir/Caddyfile" || { cp Caddyfile "$config_dir/Caddyfile"; caddy_changed=1; }
diff -rq cron "$config_dir/cron" >/dev/null 2>&1 || { rm -rf "$config_dir/cron"; cp -R cron "$config_dir/cron"; cron_changed=1; }

# ── Build ───────────────────────────────────────────────────────────────────
echo "==> Building release $release"
compose build app migrate

# ── Supporting services ─────────────────────────────────────────────────────
echo "==> Starting Postgres (if bundled), Caddy and cron"
# Naming a service starts it even when its profile is off, so only name postgres when bundled.
services=(caddy cron)
[[ ",$(setting COMPOSE_PROFILES)," == *",db,"* ]] && services=(postgres "${services[@]}")
compose up -d "${services[@]}"
if (( caddy_changed )); then
  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force
fi
(( cron_changed )) && compose up -d --force-recreate cron

# ── Migrations ──────────────────────────────────────────────────────────────
echo "==> Applying migrations"
compose run --rm migrate

# ── Rolling update ──────────────────────────────────────────────────────────
container_health() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1"; }

wait_healthy() {
  local deadline=$((SECONDS + health_timeout)) id status pending
  while :; do
    pending=0
    for id in "$@"; do
      status=$(container_health "$id")
      case "$status" in
        healthy) ;;
        unhealthy | exited | dead)
          echo "Container $id is $status. Its logs:" >&2
          docker logs --tail 50 "$id" >&2 || true
          return 1 ;;
        *) pending=1 ;;
      esac
    done
    (( pending )) || return 0
    if (( SECONDS > deadline )); then
      echo "New replicas weren't healthy after ${health_timeout}s. Logs:" >&2
      for id in "$@"; do docker logs --tail 50 "$id" >&2 || true; done
      return 1
    fi
    sleep 2
  done
}

mapfile -t old < <(compose ps -q app)

if (( ${#old[@]} == 0 )); then
  echo "==> Starting $replicas app replicas"
  compose up -d --no-deps --scale app="$replicas" app
  mapfile -t new < <(compose ps -q app)
  wait_healthy "${new[@]}"
else
  echo "==> Starting $replicas new replicas alongside ${#old[@]} running"
  compose up -d --no-deps --no-recreate --scale app=$(( ${#old[@]} + replicas )) app
  mapfile -t all < <(compose ps -q app)
  new=()
  for id in "${all[@]}"; do
    [[ " ${old[*]} " == *" $id "* ]] || new+=("$id")
  done
  if ! wait_healthy "${new[@]}"; then
    echo "==> Rolling back: removing the new replicas, old ones keep serving" >&2
    docker rm -f "${new[@]}" >/dev/null
    exit 1
  fi
  echo "==> New replicas healthy; draining the old ones"
  docker stop --time 30 "${old[@]}" >/dev/null
  docker rm "${old[@]}" >/dev/null
fi

# ── Bookkeeping ─────────────────────────────────────────────────────────────
ln -sfn "$(dirname "$deploy_dir")" "$base/current"
echo "$release $(date -u +%FT%TZ)" >> "$base/releases.log"

# Keep the five newest releases and their images, for rollback.
keep=$(ls -1t "$base/releases" | head -n 5)
for dir in "$base"/releases/*; do
  name=$(basename "$dir")
  if [[ "$name" != "$release" ]] && ! grep -qx "$name" <<<"$keep"; then
    rm -rf "$dir"
    docker image rm "aatman-app:$name" "aatman-migrate:$name" >/dev/null 2>&1 || true
  fi
done
docker image prune -f >/dev/null

echo "==> Release $release is live on https://$(setting DOMAIN)"
