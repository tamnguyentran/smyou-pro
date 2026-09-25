# M0-01 — Scaffold backend

- **Status:** Done
- **Backlog:** M0-01 · **Milestone:** M0
- **Approval:** kỹ thuật thuần; chủ dự án uỷ quyền triển khai tuần tự M0 (2026-09-25)
- **Liên quan:** ARCHITECTURE §2–§6, DECISIONS ADR-001/009, BACKLOG M0 (hợp đồng tooling)

## 1. Mục tiêu
Là nhà phát triển (người/AI), tôi cần một backend FastAPI chạy được, có cấu hình, kết nối DB, định dạng lỗi thống nhất và bộ công cụ chất lượng, để mọi tính năng sau xây trên nền nhất quán.

## 2. Phạm vi
- Trong: `backend/pyproject.toml` (uv, ruff, mypy strict, pytest + marker `ac`, import-linter, Hypothesis profiles, mutmut), `uv.lock`; `app/main.py` `create_app()`; `core/config.py`, `core/db.py`, `core/errors.py`, `core/request_id.py`; module `system` với `GET /api/v1/health`; Alembic cấu hình + migration baseline rỗng; `scripts/export_openapi.py`; `compose.dev.yml` + `.env.dev.example` (môi trường Mac M2) tối thiểu chỉ có `db` (Postgres 17, host port 5442, tạo sẵn DB `smyou_test`); `.env.prod.example` (AlmaLinux) — `compose.prod.yml` làm ở M0-03.
- Ngoài: auth, spec loader (M0-04), Dockerfile backend & compose đầy đủ (M0-03), frontend.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-001 | DB Postgres đang chạy và cấu hình đúng | `GET /api/v1/health` | 200, JSON `{"status":"ok","database":"ok","version":"<app_version>"}` | integration |
| AC-SYS-006 | `DATABASE_URL` trỏ tới host/port không kết nối được | `GET /api/v1/health` | 503 `application/problem+json`, `code="SERVICE_UNAVAILABLE"`, `detail` tiếng Việt; body **không** chứa chuỗi kết nối/mật khẩu; phản hồi trong < 5 giây | unit |
| AC-SYS-007 | App chạy | `GET /api/v1/khong-ton-tai` | 404 problem+json `code="NOT_FOUND"`, `detail="Không tìm thấy tài nguyên."` | unit |
| AC-SYS-008 | Một route nhận body có trường số nguyên bắt buộc | gửi body thiếu trường / sai kiểu | 422 problem+json `code="VALIDATION_ERROR"`, `errors` là danh sách `{field, code, message}` có `field` đúng tên trường | unit |
| AC-SYS-009 | Một route ném exception không lường trước | gọi route | 500 problem+json `code="INTERNAL_ERROR"`, không có traceback/tên exception trong body; body có `request_id` trùng header `X-Request-ID` | unit |
| AC-SYS-010 | Request có header `X-Request-ID: abc-123` | gọi bất kỳ route | response header `X-Request-ID: abc-123`; không có header → server sinh UUID | unit |
| AC-SYS-011 | Backend đã cài | chạy `python scripts/export_openapi.py <file>` hai lần | file JSON giống hệt nhau (sắp xếp key ổn định); có operation `system_health` tại `/api/v1/health` | unit |
| AC-SYS-012 | DB test đang chạy | `alembic upgrade head` → `downgrade -1` → `upgrade head` → `alembic check` | tất cả thành công | CI/`make migrations-check` |

## 4. API
| Method | Path | Capability | Response | Lỗi |
|---|---|---|---|---|
| GET | /api/v1/health | public (`public_routes`) | `HealthResponse` | 503 |

## 5. Dữ liệu / Migration
Migration baseline rỗng `0001_baseline` (chỉ để chuỗi migration có gốc). Không có bảng nghiệp vụ.

## 6. UI
Không có.

## 7. Kịch bản UAT thủ công
1. `make setup` (tạo `.env.dev`) → `docker compose -f compose.dev.yml --env-file .env.dev up -d db` → `cd backend && uv run uvicorn app.main:app --port 8010` → mở `http://localhost:8010/api/v1/health` thấy `status: ok`.
2. Tắt DB (`docker compose -f compose.dev.yml stop db`) → tải lại → thấy lỗi 503 tiếng Việt.

## 8. Giả định & câu hỏi
- Cổng dev: DB 5442, backend 8010, Vite 5183 (máy dev đã có dịch vụ khác chiếm 5432/5433/8000/5173).
- Hợp đồng import-linter cho `domain.py` được thêm khi module nghiệp vụ đầu tiên có `domain.py` (M1); M0-01 chỉ có hợp đồng `app.core` không import `app.modules`.
