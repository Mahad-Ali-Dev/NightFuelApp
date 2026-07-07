#!/usr/bin/env bash
# ── Zeitra nightly Postgres backup ────────────────────────────────────────────
# Dumps EVERY database in the compose postgres container to compressed,
# pg_restore-able custom-format archives, then prunes old ones.
#
# Layout:   $BACKUP_ROOT/YYYY-MM-DD/<db>.dump  (+ globals.sql for roles)
# Retention: daily dumps kept RETENTION_DAYS; Sunday dumps kept RETENTION_WEEKS.
#
# Install (as the user that can run docker):
#   crontab -e
#   0 4 * * * /home/deploy/nightfuel/infra/ops/pg-backup.sh >> /home/deploy/backups/pg-backup.log 2>&1
#
# RESTORE (single database, e.g. nightfuel_auth):
#   cd /home/deploy/nightfuel/infra/docker
#   gunzip -k /home/deploy/backups/2026-07-02/nightfuel_auth.dump.gz
#   docker compose exec -T postgres pg_restore -U postgres -d nightfuel_auth \
#       --clean --if-exists < /home/deploy/backups/2026-07-02/nightfuel_auth.dump
#   (drop --clean for a restore into a freshly created empty DB)
#
# NOTE: these dumps live on the SAME disk as the database. They protect against
# bad migrations, accidental deletes and container-level corruption — NOT
# against the VPS disk dying. Sync $BACKUP_ROOT offsite (rclone/scp/object
# storage) for full disaster coverage; see infra/ops/README.md.
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/home/deploy/nightfuel/infra/docker}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/deploy/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
RETENTION_WEEKS="${RETENTION_WEEKS:-8}"

STAMP="$(date +%F)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

cd "$COMPOSE_DIR"

echo "[$(date -Is)] backup start -> $DEST"

# Roles / grants (tiny, but needed for a bare-metal rebuild).
docker compose exec -T postgres pg_dumpall -U postgres --globals-only \
    | gzip > "$DEST/globals.sql.gz"

# Every non-template database, discovered dynamically so new service DBs are
# picked up automatically.
DBS="$(docker compose exec -T postgres psql -U postgres -tAc \
    "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> 'postgres';")"

for db in $DBS; do
    docker compose exec -T postgres pg_dump -U postgres -Fc "$db" \
        | gzip > "$DEST/${db}.dump.gz"
    echo "  dumped $db ($(du -h "$DEST/${db}.dump.gz" | cut -f1))"
done

# Sanity: every archive must be a valid gzip and non-trivial.
for f in "$DEST"/*.gz; do
    gunzip -t "$f"
    [ "$(stat -c%s "$f")" -gt 200 ] || { echo "SUSPICIOUSLY SMALL: $f"; exit 1; }
done

# ── Retention ────────────────────────────────────────────────────────────────
# Delete daily folders older than RETENTION_DAYS, except Sunday folders which
# survive RETENTION_WEEKS.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' | while read -r dir; do
    day="$(basename "$dir")"
    age_days=$(( ( $(date +%s) - $(date -d "$day" +%s) ) / 86400 ))
    dow="$(date -d "$day" +%u)"   # 7 = Sunday
    if [ "$age_days" -gt "$RETENTION_DAYS" ] && { [ "$dow" != "7" ] || [ "$age_days" -gt $(( RETENTION_WEEKS * 7 )) ]; }; then
        echo "  pruning $dir (${age_days}d old)"
        rm -rf "$dir"
    fi
done

echo "[$(date -Is)] backup done ($(du -sh "$DEST" | cut -f1) total)"
