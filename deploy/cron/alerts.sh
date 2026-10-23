#!/bin/sh
# Runs every minute: escalates unacknowledged alerts and drains the notification outbox.
set -eu

: "${APP_URL:?set APP_URL in deploy/.env}"
: "${CRON_SECRET:?set CRON_SECRET in deploy/.env}"

wget -q -O /dev/null \
  --header="Authorization: Bearer $CRON_SECRET" \
  --post-data="" \
  "$APP_URL/api/cron/alerts"
