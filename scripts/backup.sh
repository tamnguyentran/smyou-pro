#!/usr/bin/env bash
# Daily backup, run by cron ON THE SERVER (no SSH): pg_dump + tar the uploads volume,
# keep the 14 newest of each, optionally copy out via rclone (DEPLOYMENT.md §7).
# Env: BACKUP_DIR (default /opt/smyou/backups), COMPOSE_PROJECT (default smyou), RCLONE_REMOTE (optional).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/smyou/backups}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-smyou}"
KEEP=14

mkdir -p "$BACKUP_DIR"

DB_CONTAINER="$(docker ps -q \
    --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" \
    --filter "label=com.docker.compose.service=db" | head -n1)"
if [ -z "$DB_CONTAINER" ]; then
    echo "Lỗi: không tìm thấy container CSDL (db) của project ${COMPOSE_PROJECT} đang chạy — pg_dump thất bại." >&2
    exit 1
fi

PG_USER="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)"
PG_DB="$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB)"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_TMP="${BACKUP_DIR}/.db-${TIMESTAMP}.dump.tmp"
DB_FINAL="${BACKUP_DIR}/db-${TIMESTAMP}.dump"

if docker exec "$DB_CONTAINER" pg_dump -Fc -U "$PG_USER" "$PG_DB" >"$DB_TMP"; then
    mv "$DB_TMP" "$DB_FINAL"
else
    rm -f "$DB_TMP"
    echo "Lỗi: pg_dump thất bại — không tạo được bản sao lưu CSDL." >&2
    exit 1
fi

UPLOADS_VOLUME="$(docker volume ls -q \
    --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" | grep -E 'uploads$' | head -n1 || true)"
if [ -n "$UPLOADS_VOLUME" ]; then
    docker run --rm \
        -v "${UPLOADS_VOLUME}:/data:ro" \
        -v "${BACKUP_DIR}:/backup" \
        alpine tar czf "/backup/uploads-${TIMESTAMP}.tar.gz" -C /data .
else
    echo "Cảnh báo: không tìm thấy volume uploads của project ${COMPOSE_PROJECT} — bỏ qua sao lưu file." >&2
fi

prune() {
    local pattern="$1"
    local count remove_count
    # shellcheck disable=SC2012
    count="$(ls -1 "$BACKUP_DIR"/$pattern 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$count" -gt "$KEEP" ]; then
        remove_count=$((count - KEEP))
        # shellcheck disable=SC2012
        ls -1 "$BACKUP_DIR"/$pattern 2>/dev/null | sort | head -n "$remove_count" | xargs rm --
    fi
}
prune "db-*.dump"
prune "uploads-*.tar.gz"

if [ -n "${RCLONE_REMOTE:-}" ]; then
    echo "Đang copy bản sao lưu ra ${RCLONE_REMOTE}..."
    rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE"
else
    echo "RCLONE_REMOTE chưa cấu hình — bỏ qua copy ra ngoài server."
fi

echo "✅ Sao lưu xong: ${DB_FINAL}"
