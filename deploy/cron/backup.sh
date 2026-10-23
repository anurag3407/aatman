#!/bin/sh
# Nightly pg_dump into /backups (BACKUP_DIR on the host), keeping BACKUP_KEEP_DAYS days.
# Answers and summaries in the dump are field-encrypted; DATA_ENCRYPTION_KEY and
# PSEUDONYM_KEY are not in it. Copy these files off the server: a backup on the same disk
# doesn't survive losing the VPS.
set -eu
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="/backups/aatman-$stamp.dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$out.partial"
mv "$out.partial" "$out"
find /backups -name 'aatman-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
echo "backup: wrote $out ($(du -h "$out" | cut -f1))"
