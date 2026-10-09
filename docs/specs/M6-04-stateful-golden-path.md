# M6-04 — Stateful test toàn workflow + E2E golden path

- **Status:** Done
- **Backlog:** M6-04 · **Milestone:** M6
- **Liên quan:** `spec/state_machines.yaml` (toàn bộ 3 máy `order`/`task`/`assignment` + `invariants` dòng 189–197); `docs/process/TESTING_STRATEGY.md` §3.40 (stateful) và §5 (E2E, dòng 58–63 — mô tả golden path gốc); `docs/specs/M6-03a-revision-reopen-api.md` (AC-DSP-108, mẫu `defect_records` tự động gán lại đúng người); `docs/specs/M3-08-e2e-workers-cap.md` (mẫu bằng chứng ghi `docs/evidence/`). Không đổi `spec/*.yaml`.

## 1. Mục tiêu
Là người duyệt bằng chứng, tôi muốn có (1) một test thuộc tính (property-based) chạy ngẫu nhiên mọi lệnh của 3 máy trạng thái và tự kiểm tra 8 invariant trong YAML, và (2) một kịch bản E2E "golden path" chạy đúng luồng nghiệp vụ đầy đủ một lần (tạo đơn → điều phối → từ chối/giao lại → hoàn thành → khách xác nhận → hoàn tất → Chỉnh sửa → mở lại → hoàn tất lần 2), để tự tin rằng các tổ hợp trạng thái không được kiểm bởi integration test theo từng endpoint vẫn an toàn.

## 2. Phạm vi
- Trong phạm vi:
  - `backend/tests/stateful/test_workflow_stateful.py`: `hypothesis.stateful.RuleBasedStateMachine` gọi qua **service layer** (như integration test, không qua HTTP) với Postgres test thật; 1 rule cho mỗi lệnh ở `spec/state_machines.yaml` (trừ 2 lệnh `actor: system` — `start_dispatch`/`all_tasks_done` — là hệ quả tự động, không có rule riêng); 1 `@invariant()` cho mỗi dòng trong `invariants:`.
  - `backend/tests/unit/test_stateful_invariant_coverage.py`: test nhỏ đối chiếu số invariant trong YAML với số `@invariant()` đã viết (chặn ai đó thêm invariant vào YAML mà quên code).
  - `frontend/e2e/golden-path.spec.ts`: 1 test chạy trên cả 2 project (`mobile`/`desktop`), mỗi project tạo đơn riêng (không đụng nhau), đi hết luồng ở §3 AC-SYS-096/097.
  - Thêm 2 tài khoản kỹ thuật viên "sạch" (đã đổi mật khẩu) vào `backend/scripts/seed_e2e.py` để đủ 3 KTV cho luồng (KTV1 dùng lại `khoa.shell@smyou.vn` đã có).
  - 1 lần chạy thủ công "cấy lỗi" để chứng minh stateful test bắt được hồi quy (AC-SYS-095), ghi vào `docs/evidence/M6-04-stateful-regression.md`.
- Ngoài phạm vi:
  - Không xây tầng repository/in-memory tách khỏi Postgres (xem §8 — khác với mô tả "2 profile" trong TESTING_STRATEGY §40; code hiện tại không có tầng port/repository để cắm in-memory).
  - Không làm màn hình/báo cáo KPI thật (đó là `M8-01`); phần "KPI hiện 1 lỗi" của golden path chỉ xác nhận qua dữ liệu đã có (`TaskDetail.reopen_count`, `audit-events`), không qua UI KPI.
  - Không sửa code sản phẩm (trừ khi stateful test lộ bug thật — nếu vậy dừng, báo người dùng, không tự sửa guard/business rule).
  - Không thêm case 403/404/409 mới — các case đó đã có integration test riêng theo từng endpoint (M3–M6a).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-093 | DB Postgres test sạch (`smyou_test`, transaction riêng mỗi example); `WorkflowMachine` có 1 rule/lệnh cho 15/16 lệnh có `actor` tường minh của `order`/`task`/`assignment` (`submit, recall, cancel, cancel_active, request_revision, complete` của order; `create, update, add_assignee, reopen, cancel` của task; `accept, reject, start, complete, remove` của assignment) — trừ `cancel_active` vì không có đường gọi nào trong code hiện tại (xem `OPEN_QUESTIONS.md`) | `uv run pytest tests/stateful -q` với `settings(max_examples=50, stateful_step_count<=25, deadline=None)` | Thoát mã 0; 0 test fail; Hypothesis không in `Falsifying example`; không còn file nào trong `.hypothesis/examples` sau khi chạy sạch | stateful |
| AC-SYS-094 | `spec/state_machines.yaml#invariants` có đúng 8 dòng (189–197) | `backend/tests/unit/test_stateful_invariant_coverage.py` đọc YAML và soi `WorkflowMachine` bằng `inspect` tìm các hàm có decorator `@invariant()` | Số hàm `@invariant()` == 8; mỗi docstring của hàm khớp đúng 1 dòng trong YAML (so khớp chuỗi, không phân biệt khoảng trắng đầu/cuối); test đỏ nếu ai thêm/xoá 1 dòng invariant trong YAML mà không sửa file test | unit |
| AC-SYS-095 | `WorkflowMachine` đang xanh (AC-SYS-093) | người thực hiện `/implement` tạm xoá lệnh gọi `fire_order_reevaluate` trong `assignment.complete` (service `dispatch`), chạy lại `pytest tests/stateful -q`, rồi **hoàn tác** | Test đỏ trong ≤ 50 example, Hypothesis shrink về 1 dãy lệnh ≤ 6 bước, thông báo lỗi nêu đúng câu invariant "A task's stored status always equals the derived status computed from its assignments."; sau khi hoàn tác, `git diff` ở các file service sạch (không còn thay đổi) | stateful (thủ công 1 lần, ghi bằng chứng) |
| AC-SYS-096 | Sale "Lê Thị Hoa" (`hoa.e2e@smyou.vn`) đăng nhập; khách "Anh Ngọc E2E - Grand Hotel" (`E2E-KH-002`), dịch vụ "Lắp đặt camera E2E" 300.000đ (`E2E-DV-001`) đã có sẵn (seed); QLKT "Phạm Quốc Tuấn" (`tuan.lead@smyou.vn`); 3 KTV: Khoa (`khoa.shell@smyou.vn`), Minh (`minh.ktv2@smyou.vn`, mới thêm), Đức (`duc.ktv3@smyou.vn`, mới thêm) | Hoa tạo đơn (khách trên, 1 dòng dịch vụ, địa chỉ "186 Dương Công Khi, Xã Hóc Môn") → Gửi đơn; Tuấn tạo Task A (giao Khoa) và Task B (giao Minh); Khoa từ chối Task A (lý do `SICK`, "Đang nghỉ ốm, không đi được"); Tuấn thêm Đức vào Task A; Đức & Minh: nhận → bắt đầu → hoàn thành việc của mình; Đức (đang được giao Task A) tải 1 ảnh phiếu xác nhận; Tuấn hoàn tất đơn (tên khách ký "Anh Ngọc") | Đơn chuyển đủ `PENDING_DISPATCH → IN_PROGRESS → AWAITING_CONFIRMATION → COMPLETED`; UI mỗi bước hiện đúng toast tiếng Việt tương ứng; Task A cuối cùng có 1 assignment `REJECTED` (Khoa) + 1 assignment `DONE` (Đức); Task B có 1 assignment `DONE` (Minh); không có lỗi console/network 4xx-5xx ngoài dự kiến trong suốt luồng | e2e |
| AC-SYS-097 | Tiếp AC-SYS-096, đơn đang `COMPLETED`, Task A (`cycle=1, reopen_count=0`) | Tuấn chuyển đơn sang Chỉnh sửa (lý do "Khách phản hồi lắp camera sai góc, cần chỉnh lại") → mở lại Task A (lý do "Lắp sai góc, cần làm lại", mức độ `MAJOR`) → Đức (vẫn là người của Task A) nhận lại → bắt đầu → hoàn thành → tải ảnh phiếu xác nhận mới → Tuấn hoàn tất đơn lần 2 (tên khách ký "Anh Ngọc") | Đơn `REVISION → AWAITING_CONFIRMATION → COMPLETED` lần 2, `revision_no=1`; gọi `GET /api/v1/orders/{id}/tasks/{taskA_id}` → `TaskDetail.cycle=2`, `reopen_count=1`, assignment `DONE` cycle=1 của Đức giữ nguyên không đổi, có thêm assignment `DONE` cycle=2 của Đức; Task B không đổi (`cycle=1`); Quản lý (`an.e2e@smyou.vn`) gọi `GET /api/v1/audit-events?entity_type=TASK` → có đúng 1 dòng `action=reopen` cho `entity_id=taskA_id`, `actor.code=E2E07` (mã của `tuan.lead@smyou.vn` — `ActorSummary` không có trường `email`) (đại diện "1 lỗi" ghi nhận cho KTV của Task A — chưa có báo cáo KPI thật, xem §8) | e2e + integration (gọi API trực tiếp từ test) |

## 4. API
Không thêm route mới. AC-SYS-097 gọi 2 route đã có (`GET /orders/{id}/tasks/{task_id}`, `GET /audit-events`) trực tiếp từ test (không qua UI) để xác nhận trạng thái không hiện trên màn hình nào.

## 5. Dữ liệu / Migration
- Không có migration DB.
- Thêm vào `backend/scripts/seed_e2e.py` (mảng `ACCOUNTS`): 2 dòng kỹ thuật viên mới, mật khẩu đã đổi (không ở trạng thái bắt buộc đổi mật khẩu, để test không phải đi qua luồng đổi mật khẩu lần đầu):
  - `("minh.ktv2@smyou.vn", "E2E10", "Nguyễn Thành Minh", ("TECHNICIAN",), "E2e@SmYou2026", False)`
  - `("duc.ktv3@smyou.vn", "E2E11", "Đỗ Văn Đức", ("TECHNICIAN",), "E2e@SmYou2026", False)`
- Không tạo sẵn đơn/task cho golden path — test tự tạo đơn từ đầu qua UI (mã đơn do server sinh, test đọc mã từ heading sau khi tạo, theo đúng mẫu `orders.spec.ts`).

## 6. UI
Không đổi UI/màn hình nào. Không cần screenshot theo DoD (không có thay đổi giao diện); golden path vẫn tự chụp ảnh các màn hình chính vào `reports/screenshots/{project}/golden-*.png` và chạy `axe` ở các màn hình: trang đơn sau khi gửi, bảng điều phối sau khi giao Đức, "Việc của tôi" sau khi Đức nhận Task A, trang đơn lúc `COMPLETED` (cả 2 lần) — theo đúng tinh thần TESTING_STRATEGY §62/63, không bắt buộc chụp mọi màn hình trung gian.

## 7. Kịch bản UAT thủ công (≤ 5 bước)
1. `make e2e` — tìm "golden-path" trong output, xác nhận pass ở cả 2 project.
2. Mở `reports/screenshots/mobile/golden-*.png` — xem luồng qua ảnh.
3. `uv run pytest tests/stateful -q` — xem "N passed" không có "Falsifying example".
4. Mở `docs/evidence/M6-04-stateful-regression.md` — xem bằng chứng 1 lần cấy lỗi bị bắt.
5. `GET /api/v1/orders/{id}/tasks/{task_id}` sau khi chạy golden path — tự soi `reopen_count=1`.

## 8. Giả định & câu hỏi
- Giả định kỹ thuật (không phải quy tắc nghiệp vụ): bỏ "2 profile in-memory + Postgres" mà TESTING_STRATEGY §40 mô tả, chỉ chạy 1 profile qua Postgres thật (giống integration test) vì codebase hiện không có tầng repository/port tách khỏi SQLAlchemy (ARCHITECTURE.md §ranh giới module) — dựng tầng in-memory riêng cho test là một quyết định kiến trúc lớn, không nên tự thêm ở 1 backlog item testing. Nếu người dùng muốn tầng in-memory thật, cần 1 ADR + item riêng.
- Giả định: `max_examples=50`, `stateful_step_count<=25` — đủ nhanh để `make test`/`make check` không chậm quá (mục tiêu < 60s cho riêng file này); có thể chỉnh ở `/implement` nếu CI chậm hơn dự kiến, miễn không giảm xuống mức không còn khả năng bắt bug (AC-SYS-095 vẫn phải đỏ trong giới hạn example đã đặt).
- Giả định: "KPI hiện 1 lỗi" trong câu golden path gốc (TESTING_STRATEGY dòng 61) được xác nhận gián tiếp qua `TaskDetail.reopen_count=1` + 1 dòng `audit-events action=reopen` — vì `defect_records` chưa có route đọc (đợi `M8-01`). Không thêm route đọc `defect_records` ở item này.
- Câu hỏi mới: không (đây là item kỹ thuật, không phát sinh quy tắc nghiệp vụ mới).
