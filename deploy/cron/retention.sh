#!/bin/sh
# Deletes data past its retention period (POST /api/cron/retention on any app replica).
set -eu
wget -q -O - -T 120 \
  --header "Authorization: Bearer $CRON_SECRET" \
  --post-data "" \
  http://app:3000/api/cron/retention
echo
