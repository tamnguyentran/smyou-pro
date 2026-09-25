# syntax=docker/dockerfile:1
# Targets: dev (Vite dev server, source mounted) and prod (static build served by nginx).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- dev ----------
FROM deps AS dev
COPY . .
EXPOSE 5183
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5183", "--strictPort"]

# ---------- build ----------
FROM deps AS build
# Canonical form only ("" or "/a/b"): the same value is baked into the bundle and the nginx config.
ARG BASE_PATH=/smyoutask
RUN echo "$BASE_PATH" | grep -Eq '^(/[A-Za-z0-9_-]+)*$' \
    || { echo "BASE_PATH must be empty or like /smyoutask, got '$BASE_PATH'" >&2; exit 1; }
COPY . .
RUN BASE_PATH="$BASE_PATH" npm run build

# ---------- prod ----------
FROM nginx:1.29-alpine AS prod
ARG BASE_PATH=/smyoutask
COPY nginx/default.conf.template /tmp/default.conf.template
RUN if [ -n "$BASE_PATH" ]; then redirect='s|#REDIRECT ||'; else redirect='/#REDIRECT /d'; fi \
    && sed -e "$redirect" -e "s|__BASE_PATH__|$BASE_PATH|g" /tmp/default.conf.template \
       > /etc/nginx/conf.d/default.conf \
    && rm /tmp/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html${BASE_PATH}
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q -O /dev/null "http://127.0.0.1${BASE_PATH}/" || exit 1
