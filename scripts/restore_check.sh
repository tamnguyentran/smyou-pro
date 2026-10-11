#!/usr/bin/env bash
# Monthly "is the backup actually restorable" check, run by cron ON THE SERVER (no SSH):
# restores the newest db dump into a throwaway Postgres container, counts a known table,
# then always cleans up (DEPLOYMENT.md §7 — "backup chưa thử khôi phục = chưa có backup").
# Env: BACKUP_DIR (default /opt/smyou/backups).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/smyou/backups}"

# shellcheck disable=SC2012
LATEST="$(ls -1 "$BACKUP_DIR"/db-*.dump 2>/dev/null | sort | tail -n1 || true)"
if [ -z "$LATEST" ]; then
    echo "Lỗi: Không tìm thấy bản sao lưu nào trong ${BACKUP_DIR}." >&2
    exit 1
fi

CONTAINER="smyou-restore-check-$$"
cleanup() {
    docker rm -f -v "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=restore-check \
    -e POSTGRES_DB=restore_check \
    postgres:17 >/dev/null

READY=""
for _ in $(seq 1 30); do
    if docker exec "$CONTAINER" pg_isready -U postgres -d restore_check >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 2
done
if [ -z "$READY" ]; then
    echo "Lỗi: container Postgres tạm không khởi động được kịp thời." >&2
    exit 1
fi

docker cp "$LATEST" "${CONTAINER}:/tmp/restore.dump"

if docker exec "$CONTAINER" pg_restore --no-owner --no-privileges -U postgres -d restore_check /tmp/restore.dump; then
    COUNT="$(docker exec "$CONTAINER" psql -U postgres -d restore_check -tAc 'SELECT COUNT(*) FROM employees;' | tr -d ' \n\r')"
    echo "✅ khôi phục thử thành công (bảng employees: ${COUNT} dòng, từ ${LATEST})"
else
    echo "Lỗi: pg_restore thất bại — bản sao lưu ${LATEST} có thể bị hỏng." >&2
    exit 1
fi
