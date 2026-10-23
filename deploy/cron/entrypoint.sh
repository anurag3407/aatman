#!/bin/sh
# Runs busybox crond with the retention and backup jobs. crond doesn't pass the container's
# environment to jobs, so the variables they need are written to a root-only file first.
set -eu

umask 077
export -p | grep -E '^export (DATABASE_URL|CRON_SECRET|BACKUP_KEEP_DAYS)=' > /run/cron.env

# Job output goes to crond's stdout, i.e. `docker compose logs cron`.
cat > /etc/crontabs/root <<CRONTAB
$RETENTION_SCHEDULE . /run/cron.env; /bin/sh /opt/cron/retention.sh >> /proc/1/fd/1 2>&1
$BACKUP_SCHEDULE . /run/cron.env; /bin/sh /opt/cron/backup.sh >> /proc/1/fd/1 2>&1
CRONTAB

echo "cron: retention at '$RETENTION_SCHEDULE', backups at '$BACKUP_SCHEDULE' (UTC)"
exec crond -f -l 6 -L /dev/stdout
