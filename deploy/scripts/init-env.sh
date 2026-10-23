#!/usr/bin/env bash
# Creates the server's settings file from deploy/.env.example with fresh random secrets.
# Usage: init-env.sh <domain> <acme-email> [output, default /opt/aatman/shared/.env]
# Won't overwrite an existing file: regenerating PSEUDONYM_KEY or DATA_ENCRYPTION_KEY
# would make every stored record unreachable.
set -euo pipefail

domain=${1:?usage: init-env.sh <domain> <acme-email> [output]}
email=${2:?usage: init-env.sh <domain> <acme-email> [output]}
out=${3:-/opt/aatman/shared/.env}
template="$(cd "$(dirname "$0")/.." && pwd)/.env.example"

if [[ -e "$out" ]]; then
  echo "$out already exists; leaving it alone." >&2
  exit 1
fi

pg_password=$(openssl rand -hex 24)
mkdir -p "$(dirname "$out")"
umask 077
awk \
  -v domain="$domain" \
  -v email="$email" \
  -v pg="$pg_password" \
  -v session="$(openssl rand -base64 48 | tr -d '\n')" \
  -v pseudonym="$(openssl rand -base64 48 | tr -d '\n')" \
  -v datakey="$(openssl rand -base64 32 | tr -d '\n')" \
  -v cron="$(openssl rand -hex 32)" '
  BEGIN { FS = OFS = "=" }
  /^DOMAIN=/              { print "DOMAIN", domain; next }
  /^ACME_EMAIL=/          { print "ACME_EMAIL", email; next }
  /^APP_URL=/             { print "APP_URL", "https://" domain; next }
  /^POSTGRES_PASSWORD=/   { print "POSTGRES_PASSWORD", pg; next }
  /^DATABASE_URL=/        { print "DATABASE_URL", "postgres://aatman:" pg "@postgres:5432/aatman"; next }
  /^SESSION_SECRET=/      { print "SESSION_SECRET", session; next }
  /^PSEUDONYM_KEY=/       { print "PSEUDONYM_KEY", pseudonym; next }
  /^DATA_ENCRYPTION_KEY=/ { print "DATA_ENCRYPTION_KEY", datakey; next }
  /^CRON_SECRET=/         { print "CRON_SECRET", cron; next }
  { print }
' "$template" > "$out"

echo "Wrote $out with fresh secrets."
echo "Next: fill in SSO (GOOGLE_* or MICROSOFT_*), COUNSELLOR_EMAILS and ADMIN_EMAILS, then deploy again."
echo "Back up this file somewhere safe and separate from the database backups."
