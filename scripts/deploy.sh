#!/usr/bin/env bash
# Deploy built production images from the Mac M2 to the AlmaLinux server (no registry).
# Usage: scripts/deploy.sh <TAG>
#   TAG must already be built+smoke-tested locally: make build-prod TAG=... && make smoke-prod TAG=...
set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Lỗi: Thiếu TAG. Dùng: scripts/deploy.sh <tag>" >&2
    exit 1
fi
TAG="$1"

BACKEND_IMAGE="smyou-backend:${TAG}"
WEB_IMAGE="smyou-web:${TAG}"
for image in "$BACKEND_IMAGE" "$WEB_IMAGE"; do
    if ! docker image inspect "$image" >/dev/null 2>&1; then
        echo "Lỗi: không tìm thấy image ${image} ở local. Chạy 'make build-prod TAG=${TAG}' (và 'make smoke-prod TAG=${TAG}') trước." >&2
        exit 1
    fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-${SCRIPT_DIR}/../deploy.env}"
if [ ! -f "$DEPLOY_ENV_FILE" ]; then
    echo "Lỗi: không tìm thấy ${DEPLOY_ENV_FILE}. Chạy 'cp deploy.env.example deploy.env' rồi điền thông tin server." >&2
    exit 1
fi
# shellcheck disable=SC1090
source "$DEPLOY_ENV_FILE"
: "${SERVER_HOST:?Thiếu SERVER_HOST trong ${DEPLOY_ENV_FILE}}"
: "${SERVER_USER:?Thiếu SERVER_USER trong ${DEPLOY_ENV_FILE}}"
: "${SERVER_PATH:?Thiếu SERVER_PATH trong ${DEPLOY_ENV_FILE}}"

SERVER="${SERVER_USER}@${SERVER_HOST}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

echo "Đang sao lưu CSDL trên server trước khi deploy..."
ssh "$SERVER" "cd ${SERVER_PATH} && mkdir -p backups && docker compose -f compose.prod.yml --env-file .env.prod exec -T db sh -c 'pg_dump -Fc -U \$POSTGRES_USER \$POSTGRES_DB' > backups/predeploy-${TIMESTAMP}.dump"

echo "Đang chuyển image ${TAG} lên server..."
docker save "$BACKEND_IMAGE" "$WEB_IMAGE" | gzip | ssh "$SERVER" 'gunzip | docker load'

echo "Đang chuyển compose.prod.yml lên server..."
scp "${SCRIPT_DIR}/../compose.prod.yml" "${SERVER}:${SERVER_PATH}/"

echo "Đang cập nhật IMAGE_TAG và khởi động lại dịch vụ..."
ssh "$SERVER" "cd ${SERVER_PATH} && sed -i \"s/^IMAGE_TAG=.*/IMAGE_TAG=${TAG}/\" .env.prod && docker compose -f compose.prod.yml --env-file .env.prod up -d --wait"

echo "Đang kiểm tra health sau deploy..."
if ! ssh "$SERVER" "curl -fsS http://127.0.0.1:\${WEB_PORT:-6890}/smyoutask/api/v1/health" >/dev/null; then
    echo "Lỗi: health check sau deploy thất bại. Kiểm tra log trên server (docker compose logs)." >&2
    exit 1
fi

echo "✅ Deploy xong: ${TAG}"
