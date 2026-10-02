# M3-08 — E2E ổn định dưới tải: giới hạn `workers` của Playwright

- **Status:** Approved
- **Backlog:** M3-08 · **Milestone:** M3
- **Liên quan:** `docs/specs/M3-07-stale-version-draft-save-race.md` (AC-ORD-124), `docs/process/QUALITY_GATES.md`, `reports/verification.md` §Failures. Không đổi `spec/*.yaml`.

## 1. Mục tiêu
Là người duyệt bằng chứng, tôi muốn `make e2e` xanh ổn định giữa các lần chạy, để cổng `make verify` và job CI `e2e` không đỏ ngẫu nhiên vì backend dev quá tải.

## 2. Phạm vi
- Trong phạm vi (chỉ cấu hình test, không đổi code sản phẩm):
  - Đặt `workers` trong `frontend/playwright.config.ts` (mặc định có giới hạn, cho phép ghi đè bằng biến môi trường `E2E_WORKERS`).
  - Chạy `make e2e` 3 lần liên tiếp để chứng minh ổn định; ghi kết quả vào `reports/verification.md`.
- Ngoài phạm vi:
  - Không nới timeout, không sửa assertion của test đã commit (đặc biệt `AC-AUTH-024`, `AC-ORD-024`).
  - Không ép file nào chạy tuần tự (`describe.configure({ mode: "serial" | "default" })`) — giữ AC-ORD-124.
  - Không đổi backend (số worker uvicorn, tham số argon2), không đổi `fullyParallel`.
  - Không thêm `retries` ở môi trường local (che lỗi thật); `retries` của CI giữ nguyên.

## 3. Acceptance Criteria

Dữ liệu: suite hiện có 138 test (mobile + desktop), backend dev là 1 tiến trình uvicorn `--reload`, máy dev 8 CPU.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-077 | `frontend/playwright.config.ts` | đọc cấu hình đã nạp (import `default` của file, không đặt `E2E_WORKERS`) | `workers` là số nguyên dương ≤ 4 (không phải `undefined`, không phải chuỗi phần trăm); `fullyParallel` vẫn `true` | unit |
| AC-SYS-078 | như trên | nạp cấu hình với `E2E_WORKERS=2` | `workers === 2`; với `E2E_WORKERS=abc` hoặc `0` thì rơi về giá trị mặc định (không ném lỗi, không `NaN`) | unit |
| AC-SYS-079 | cấu hình mới | `grep` toàn bộ `frontend/e2e/**/*.ts` tìm `describe.configure` và `mode: "serial"` | không có kết quả (kế thừa tinh thần AC-ORD-124 cho mọi file) | unit |
| AC-SYS-080 | Docker dev stack khoẻ, DB đã seed | chạy `make e2e` **3 lần liên tiếp**, mỗi lần dùng stack mới (`--renew-anon-volumes` đã có trong target) | cả 3 lần: 0 test đỏ, 0 test "flaky", số test passed bằng nhau (138 + test mới của item này nếu có); không test nào bị skip | e2e (thủ công có bằng chứng) |
| AC-SYS-081 | kết quả 3 lần chạy của AC-SYS-080 | ghi vào `reports/verification.md` | có bảng 3 dòng (lần, passed/failed, thời gian chạy, test chậm nhất) và nêu thời gian tổng so với trước (~ thời gian cũ ở M3-07); không có assertion/timeout nào trong `frontend/e2e/**` bị đổi so với `main` (kiểm bằng `git diff main -- frontend/e2e`: chỉ được thêm file test cho AC-SYS-079 nếu cần) | thủ công |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Không đổi giao diện; không cần screenshot.

## 7. Kịch bản UAT thủ công (≤ 5 bước)
1. `make e2e` — xem cuối output: "138 passed", không có "flaky".
2. Lặp lại thêm 2 lần; so 3 dòng trong `reports/verification.md`.
3. (Tuỳ chọn) `E2E_WORKERS=8 make e2e` để thấy ngưỡng cũ gây timeout lại, xác nhận giới hạn là nguyên nhân.

## 8. Giả định & câu hỏi
- Giả định kỹ thuật (không phải quy tắc nghiệp vụ, nên không thêm vào OPEN_QUESTIONS): giá trị mặc định `workers = 3`. Đây là điểm xuất phát; `/implement` thử 4 → 3 → 2 và chọn **giá trị lớn nhất cho 3 lần xanh liên tiếp**, ghi lại thang thử trong báo cáo. Trần ≤ 4 ở AC-SYS-077 để một ai đó không âm thầm nâng lại.
- Giả định: CI (`ubuntu`, ít CPU hơn máy dev) đã ổn với `workers` mặc định của Playwright (½ số CPU); đặt cố định có thể làm CI chậm hơn một chút nhưng không đỏ. Nếu `workers` thấp làm CI vượt giới hạn thời gian job, ghi lại và hỏi.
- Giả định: nguyên nhân là bão hoà 1 backend dev (argon2 CPU-bound + `--reload`), suy ra từ `reports/verification.md`; chưa đo trực tiếp. Nếu giảm `workers` mà vẫn đỏ ở cùng test → dừng, báo lại (có thể phải xử lý ở backend — item riêng).
- Câu hỏi mới: không.
