# M0-04 — Spec loader & test sinh từ YAML

- **Status:** Done
- **Backlog:** M0-04 · **Milestone:** M0
- **Approval:** kỹ thuật thuần; chủ dự án uỷ quyền triển khai tuần tự M0 (2026-09-25)
- **Liên quan:** `spec/state_machines.yaml`, `spec/permissions.yaml`; ARCHITECTURE §3, §6; TESTING_STRATEGY §3 (Sinh từ YAML)

## 1. Mục tiêu
Là nhà phát triển, tôi muốn backend đọc và kiểm tra hai file YAML nguồn sự thật ngay khi khởi động, để một lỗi gõ trong luật nghiệp vụ/phân quyền làm app **không chạy** thay vì chạy sai; và muốn test tự động bắt mọi endpoint quên khai báo quyền, mọi guard trong YAML chưa có code.

## 2. Phạm vi
- Trong:
  - `app/core/spec_loader.py`: model Pydantic (cấm trường lạ) cho cả hai file + kiểm tra tham chiếu chéo; lỗi → `SpecError` nêu tên file và vị trí. Phát hiện khoá YAML trùng.
  - `Settings.spec_dir` (mặc định `<repo>/spec`; trong image prod là `/spec`). `create_app` nạp spec, lưu `app.state.specs`; spec lỗi → không tạo được app.
  - Registry guard `app/modules/workflow/guards.py`: `GUARDS` (đã cài) và `PENDING_GUARDS` (tên guard → backlog ID sẽ cài). Khởi động kiểm tra: guard trong YAML phải thuộc một trong hai.
  - `app/core/authz.py`: `require(capability)` — dependency gắn tên capability vào route; ở M0 luôn trả 401 `UNAUTHENTICATED` (đóng khi lỗi) cho tới khi M1-02 cài xác thực. Hàm `undeclared_routes(app, permissions)` dùng cho test.
  - Test sinh: `tests/generated/test_guards_implemented.py`, `tests/generated/test_routes_declare_capability.py`.
  - Docker: image prod chứa `spec/` (build context `spec`); stack dev mount `./spec` chỉ đọc.
  - `pyyaml` khai báo trực tiếp (đã có sẵn qua `uvicorn[standard]`) + `types-PyYAML` (dev, cho mypy strict).
- Ngoài: logic guard thật (các item M3–M6), xác thực/scope (M1-01, M1-02), đồng bộ `menu.ts`/`status.ts` với YAML (M1-03), ma trận RBAC/transition (khi có endpoint).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-005 | Thư mục spec có `state_machines.yaml` sai cú pháp YAML, **hoặc** thiếu trường bắt buộc (vd transition thiếu `to`), **hoặc** `permissions.yaml` thiếu `capabilities` | `create_app(Settings(spec_dir=...))` | ném `SpecError`; thông điệp có tên file và đường dẫn trường lỗi (vd `order.transitions[0].to`); không tạo app | unit |
| AC-SYS-024 | Hai file YAML hiện tại của repo | nạp spec | thành công: máy trạng thái `order` (7 trạng thái, 8 transition), `task` (6 trạng thái, 5 lệnh), `assignment` (6 trạng thái, 5 transition); 20 guard; 4 vai trò; 28 capability; 4 public route; `app.state.specs` có dữ liệu này | unit |
| AC-SYS-025 | Bản sao hợp lệ của hai file rồi sửa một chỗ | nạp spec | `SpecError` nêu đúng tên sai, cho từng trường hợp: `to`/`from` trỏ trạng thái không tồn tại; `initial` không có trong `states`; guard chưa khai báo trong `guards`; transition dùng capability không có trong `permissions.yaml`; transition có cả `capability` lẫn `actor` hoặc không có cái nào; `allowed_task_status`/`derived_status` trỏ trạng thái lạ; `color` ngoài {todo, in_progress, review, completed, urgent}; capability gán cho vai trò lạ hoặc scope lạ; mục menu (kể cả mục con) dùng capability lạ; `id` menu trùng; `public_routes` sai dạng `METHOD /path`; `primary_action` cho vai trò lạ; khoá YAML trùng trong cùng một map | unit |
| AC-SYS-026 | Registry guard | chạy test sinh | mọi guard trong YAML nằm trong `GUARDS` hoặc `PENDING_GUARDS` (không cả hai); không có tên thừa; mỗi mục chờ trỏ tới backlog ID có trong `BACKLOG.md` và chưa `[x]`; mọi hàm trong `GUARDS` gọi được | generated |
| AC-SYS-027 | App thật và app thử | chạy test sinh | app thật: mọi route API có đúng một `require(...)` với capability có trong YAML, hoặc `"METHOD path"` nằm trong `public_routes`; app thử có route không khai báo / capability lạ / hai `require` → được báo từng route | generated |
| AC-SYS-028 | Route gắn `require("order.read")` | gọi route (M0, chưa có đăng nhập) | 401 `application/problem+json`, `code="UNAUTHENTICATED"`, `detail` tiếng Việt | unit |
| AC-SYS-029 | YAML của repo thiếu một guard trong cả `GUARDS` lẫn `PENDING_GUARDS` | `create_app` | ném `SpecError` nêu tên guard | unit |
| AC-SYS-030 | Image prod đã build | chạy `python -c` trong image nạp app | nạp spec thành công từ `/spec` (không cần mount); stack prod khởi động healthy (smoke) | docker |

## 4. API
Không có endpoint mới. `require()` chỉ là dependency.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Không có.

## 7. Kịch bản UAT thủ công
1. Sửa `spec/state_machines.yaml` (vd đổi `to: PENDING_DISPATCH` thành `to: PENDING`) → `make up` → backend không healthy, log nêu `order.transitions[0].to`. Hoàn tác → backend healthy.

## 8. Giả định & câu hỏi
- Ánh xạ guard → backlog trong `PENDING_GUARDS` là kế hoạch kỹ thuật (không phải luật nghiệp vụ): submit/recall/cancel → M3-03; điều phối/giao việc → M4-01, M4-02; từ chối → M5-02; hoàn thành task/đơn → M5-03; hoàn tất đơn → M6-02; chỉnh sửa → M6-03.
- `public_routes` có thể liệt kê route chưa tồn tại (auth ở M1-01); không kiểm chiều ngược.
- Thư viện: khai báo trực tiếp `pyyaml` (đang dùng gián tiếp) và thêm `types-PyYAML` (chỉ dev, stub kiểu cho mypy). **Cần chủ dự án biết**; không thêm thư viện runtime mới.
