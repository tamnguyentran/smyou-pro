#!/usr/bin/env bash
# Pre-go-live safety check, run on the server before letting real staff/customers in
# (DEPLOYMENT.md §7-9, M9-03). Checks the production env file, then the live DB via the
# `db` container of COMPOSE_PROJECT (same container-lookup convention as backup.sh).
# Usage: scripts/golive_check.sh --env-file <path>
# Env: COMPOSE_PROJECT (default smyou).
set -euo pipefail

ENV_FILE=""
while [ $# -gt 0 ]; do
    case "$1" in
    --env-file)
        ENV_FILE="${2:-}"
        shift 2
        ;;
    --env-file=*)
        ENV_FILE="${1#*=}"
        shift
        ;;
    *)
        shift
        ;;
    esac
done

if [ -z "$ENV_FILE" ] || [ ! -f "$ENV_FILE" ]; then
    echo "Lỗi: Thiếu --env-file hoặc file không tồn tại: ${ENV_FILE}" >&2
    exit 1
fi

CHANGE_VARS="$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=.*CHANGE-ME' "$ENV_FILE" | cut -d= -f1 | tr '\n' ' ' || true)"
if [ -n "$CHANGE_VARS" ]; then
    echo "Lỗi: còn giá trị CHANGE-ME chưa điền ở biến: ${CHANGE_VARS}" >&2
    exit 1
fi

get_value() {
    grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//' | sed 's/[[:space:]]*$//'
}

COOKIE_SECURE_VAL="$(get_value COOKIE_SECURE)"
if [ "$COOKIE_SECURE_VAL" != "true" ]; then
    echo "Lỗi: COOKIE_SECURE phải là true (hiện tại: ${COOKIE_SECURE_VAL:-<trống>})" >&2
    exit 1
fi

WEB_BIND_VAL="$(get_value WEB_BIND)"
if [ "$WEB_BIND_VAL" != "127.0.0.1" ]; then
    echo "Lỗi: WEB_BIND phải là 127.0.0.1 (hiện tại: ${WEB_BIND_VAL:-<trống>})" >&2
    exit 1
fi

COMPOSE_PROJECT="${COMPOSE_PROJECT:-smyou}"
DB_CONTAINER="$(docker ps -q \
    --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" \
    --filter "label=com.docker.compose.service=db" | head -n1)"
if [ -z "$DB_CONTAINER" ]; then
    echo "Lỗi: không tìm thấy container CSDL (db) của project ${COMPOSE_PROJECT} đang chạy." >&2
    exit 1
fi

PG_USER="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)"
PG_DB="$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB)"

EMP_COUNT="$(docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc 'SELECT COUNT(*) FROM employees;' | tr -d ' \n\r')"
if [ "$EMP_COUNT" = "0" ]; then
    echo "Lỗi: Chưa có tài khoản Quản lý chung — chạy python -m app.cli create-manager trước." >&2
    exit 1
fi

LEFTOVERS=()
EMP_E2E="$(docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "SELECT COUNT(*) FROM employees WHERE code LIKE 'E2E%';" | tr -d ' \n\r')"
if [ "$EMP_E2E" != "0" ]; then
    LEFTOVERS+=("employees: ${EMP_E2E} dòng")
fi
PROD_E2E="$(docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "SELECT COUNT(*) FROM products WHERE sku LIKE 'E2E-%';" | tr -d ' \n\r')"
if [ "$PROD_E2E" != "0" ]; then
    LEFTOVERS+=("products: ${PROD_E2E} dòng")
fi
SVC_E2E="$(docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "SELECT COUNT(*) FROM services WHERE code LIKE 'E2E-%';" | tr -d ' \n\r')"
if [ "$SVC_E2E" != "0" ]; then
    LEFTOVERS+=("services: ${SVC_E2E} dòng")
fi

if [ "${#LEFTOVERS[@]}" -gt 0 ]; then
    echo "Lỗi: còn dữ liệu test (mã E2E*) trong: ${LEFTOVERS[*]}" >&2
    exit 1
fi

echo "✅ Sẵn sàng go-live"
