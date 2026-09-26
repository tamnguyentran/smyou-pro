# Architecture & Conventions

## 1. Tổng quan
Modular monolith: 1 backend FastAPI + 1 SPA React + PostgreSQL, chạy bằng Docker Compose. Production: nginx hệ thống (HTTPS, `ilabsviet.com`) → container `web` (nginx: SPA + proxy `/smyoutask/api` → backend) — ADR-014.

```
Browser (mobile/desktop)
   │ HTTPS
 [nginx] ── /        → static SPA (frontend/dist)
         └─ /api/v1  → [backend: FastAPI + uvicorn] ── [PostgreSQL 17]
                                     └── /data/uploads (volume)
```

## 2. Stack (chốt — không tự thêm thư viện ngoài danh sách; cần thêm → hỏi + ghi ADR)
| Tầng | Chọn | Ghi chú |
|---|---|---|
| Python | 3.12, quản lý bằng **uv** (`uv.lock` commit) | |
| API | FastAPI, Pydantic v2, pydantic-settings | |
| DB | PostgreSQL 17, SQLAlchemy 2.0 (**sync**, `psycopg[binary]` v3), Alembic | sync đơn giản, dễ test; FastAPI chạy trong threadpool |
| Auth | pwdlib[argon2], PyJWT; cookie httpOnly | access 15', refresh 7 ngày, rotate |
| Test BE | pytest, pytest-cov, hypothesis, schemathesis, httpx TestClient, polyfactory | |
| Chất lượng BE | ruff (lint+format), mypy `--strict`, import-linter | |
| Node | 22 LTS, npm (`package-lock.json` commit) | |
| UI | React 19 + TypeScript strict + Vite | |
| Style | Tailwind CSS v4 (`@theme` tokens trong CSS), `clsx` + `tailwind-merge` | |
| Icon | lucide-react | không dùng emoji làm icon chức năng |
| Font | `@fontsource-variable/plus-jakarta-sans` (tự host, không CDN) | |
| Routing / data | React Router, TanStack Query | |
| Form | react-hook-form + zod | |
| API client | `openapi-typescript` + `openapi-fetch` (types sinh từ OpenAPI — không viết tay) | |
| Test FE | Vitest, Testing Library, MSW; Playwright + @axe-core/playwright | |
| Chất lượng FE | ESLint (typescript-eslint strict, react-hooks, jsx-a11y), Prettier, `tsc --noEmit` | |

Phiên bản cụ thể: chọn bản stable mới nhất lúc scaffold (M0), pin chính xác trong lockfile.

## 3. Cấu trúc thư mục
```
backend/
  pyproject.toml            # deps + ruff + mypy + pytest + importlinter config
  alembic/ alembic.ini
  app/
    main.py                 # create_app(), include routers, exception handlers
    core/                   # config, db (engine/session), security, errors, logging, spec_loader, authz
    modules/
      identity/             # employees, roles, auth, me
      catalog/              # products, services
      customers/
      orders/               # orders, lines, pricing, revisions, confirmation
      dispatch/             # tasks, assignments, defect records
      files/                # attachments storage
      audit/
      notifications/
      reporting/            # dashboard, KPI (read-only queries)
    # mỗi module:
    #   domain.py    — THUẦN Python: enum, dataclass, guard, tính tiền, derive status. Không import fastapi/sqlalchemy.
    #   models.py    — SQLAlchemy ORM
    #   schemas.py   — Pydantic request/response
    #   service.py   — use case: mở transaction, khoá, gọi domain, ghi audit, phát notification
    #   router.py    — HTTP mỏng: parse → require(capability) → service → response
    #   queries.py   — (tuỳ chọn) truy vấn đọc có áp scope
  tests/
    unit/                   # domain thuần, không DB — chạy trong check-fast
    integration/            # API + Postgres thật (DB test riêng, rollback mỗi test)
    stateful/               # Hypothesis RuleBasedStateMachine cho workflow
    contract/               # schemathesis fuzz từ OpenAPI
    generated/              # test sinh từ spec/*.yaml (RBAC matrix, transition matrix)
    factories.py conftest.py
frontend/
  src/
    app/                    # router, providers, AppShell (sidebar/drawer/bottom-nav), menu.ts, auth guard
    components/ui/          # Button, IconButton, Badge, StatusBadge, Card, Input, Select, Textarea,
                            # Sheet (bottom sheet mobile / modal desktop), ConfirmDialog, EmptyState,
                            # Skeleton, Toast, DataList (list mobile ↔ table desktop), MoneyText, DateText
    features/<feature>/     # api.ts (hooks TanStack Query), components/, pages/, schemas.ts (zod), *.test.tsx
    lib/                    # api/ (schema.d.ts sinh tự động + client), format.ts, status.ts, cn.ts
    styles/index.css        # @import "tailwindcss"; @theme { tokens }
  e2e/                      # Playwright: *.spec.ts, fixtures (seed users), screenshots
spec/                       # state_machines.yaml, permissions.yaml (nguồn sự thật)
scripts/                    # check_ac_coverage.py, export_openapi.py, seed_dev.py …
```

**Ranh giới (import-linter enforce):** `domain` không import gì ngoài stdlib + `domain` khác; `router` không import `models`; module chỉ gọi module khác qua `service` public của nó. Ngoại lệ đã biết: `employees` (quản trị nhân viên, M1-04a) đọc/ghi trực tiếp bảng `employees`/`employee_roles` thuộc model của `identity` (cùng một thực thể), nhưng mọi hành vi phiên đăng nhập (thu hồi phiên) đi qua `identity.service` (`revoke_all_sessions`).

## 4. Quy ước API
- Tiền tố `/api/v1`. JSON `snake_case`. ID là UUID; hiển thị dùng `code`.
- **Lệnh là POST có tên**: `POST /orders/{id}/submit`, `POST /assignments/{id}/reject`… Body luôn có `version` (int) của aggregate để chống ghi đè. **Không** có endpoint nhận `status` tuỳ ý.
- CRUD: `GET /products?q=&category=&is_active=&limit=&offset=` → `{ items, total, limit, offset }`; `limit` ≤ 100.
- Lỗi: RFC 9457 `application/problem+json`:
  `{ "type": "about:blank", "title": "...", "status": 409, "code": "INVALID_TRANSITION", "detail": "Thông điệp tiếng Việt cho người dùng", "errors": [{ "field": "reason", "code": "too_short" }] }`
  Mã chuẩn: `VALIDATION_ERROR` 422, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `INVALID_TRANSITION` 409, `GUARD_FAILED` 409 (kèm `guard`), `STALE_VERSION` 409, `CONFLICT` 409, `FILE_REJECTED` 415/413.
- Mọi route khai báo `response_model`, `summary`, `operation_id` (dạng `orders_submit`) → client TS sinh ra có tên ổn định.
- `GET /api/v1/me` trả `{ employee, roles, capabilities: { "order.read": ["all"], "dashboard.read": ["own", "self"], ... }, counters: {...} }` — mỗi capability kèm **danh sách** phạm vi hiệu lực (hợp các vai trò; có `all` thì chỉ còn `all`); `counters` chỉ có badge của mục menu người đó thấy. Frontend dựng menu từ đây.

## 5. Quy ước DB
- Tên bảng số nhiều snake_case; FK `<entity>_id`; index cho mọi FK và cột lọc.
- Enum lưu `varchar` + CHECK constraint (dễ migrate hơn PG enum).
- `created_at/updated_at timestamptz default now()`; không dùng `timestamp without time zone`.
- Không xoá cứng dữ liệu nghiệp vụ; dùng `is_active` / `cancelled_at`.
- Mỗi migration: có `downgrade()`; không sửa migration đã merge; tên `YYYYMMDD_HHMM_<mô_tả>.py`.
- Sequence sinh mã (đơn, khách hàng) bằng bảng `code_sequences(scope, period, last_value)` + `FOR UPDATE`.

## 6. Quy ước backend
- Hàm service nhận `session`, `actor: Actor`, `command: XxxCommand`; trả domain/DTO. Transaction mở ở dependency `get_uow()`; service không `commit` lẻ tẻ.
- State machine: `core/spec_loader.py` đọc `spec/state_machines.yaml` lúc khởi động; `domain.transition(entity, command, ctx)` tra bảng, chạy guard theo tên (`GUARDS[name]`), trả danh sách effect. Guard thiếu implementation → app không khởi động (test bắt được).
- Authz: `require("capability")` dependency trả `Actor(id, roles, capability, scopes)`; truy vấn đọc luôn qua `apply_scope(query, actor, RULES)` (mỗi module khai báo `RULES = {"own": …, "assigned": …}`; scope không có luật → không trả dòng nào); đọc 1 bản ghi qua `get_in_scope_or_404`. Bộ đếm badge đăng ký trong `COUNTERS` ở `app/main.py`.
- Logging JSON có `request_id`; không log mật khẩu, token, số điện thoại đầy đủ.
- Cấu hình qua biến môi trường (`.env`), không hard-code secret.

## 7. Quy ước frontend
- Trang = `features/<x>/pages/*Page.tsx`; không gọi `fetch` trực tiếp — dùng hook trong `api.ts`.
- Trạng thái server: TanStack Query (key: `['orders', params]`); sau lệnh → `invalidateQueries` aggregate liên quan.
- Hiển thị trạng thái qua `<StatusBadge machine="order" status={...}/>` dùng nhãn/màu từ bản sao `spec/state_machines.yaml` (`lib/status.ts`, có test so khớp).
- Nút hành động chỉ hiện khi `allowed_commands` (backend trả kèm mỗi aggregate) chứa lệnh đó — FE không tự tính luật.
- Mỗi trang có đủ 4 trạng thái: loading (Skeleton), empty (EmptyState + icon + CTA), error (thông điệp + thử lại), success.
- Form: zod schema; lỗi 422 từ server map vào field.
- Không `any`; không `useEffect` để fetch dữ liệu.
