#!/usr/bin/env bash
# Restores a pg_dump file from the backup directory into the bundled Postgres. Destroys the
# current data, so it asks first. Stop traffic during a restore: the app replicas keep
# running but see an empty database until it finishes.
# Usage (on the VPS): /opt/aatman/current/deploy/scripts/restore.sh /opt/aatman/backups/aatman-<stamp>.dump
set -euo pipefail

dump=${1:?usage: restore.sh <backup.dump>}
[[ -f "$dump" ]] || { echo "No such file: $dump" >&2; exit 1; }
deploy_dir="$(cd "$(dirname "$0")/.." && pwd)"
compose() { docker compose --project-directory "$deploy_dir" -f "$deploy_dir/compose.yaml" "$@"; }

read -r -p "Replace ALL data in the aatman database with $(basename "$dump")? Type 'restore': " answer
[[ "$answer" == "restore" ]] || { echo "Cancelled."; exit 1; }

compose exec -T postgres pg_restore --clean --if-exists --no-owner --no-privileges \
  --single-transaction -U aatman -d aatman < "$dump"
echo "Restored. Check: curl -fsS https://\$DOMAIN/api/health"
