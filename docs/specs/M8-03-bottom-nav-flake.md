# M8-03 — Điều tra & sửa flake `bottom-nav.spec.ts` (AC-SYS-047/051)

- **Status:** Approved
- **Backlog:** M8-03 · **Milestone:** M8
- **Liên quan:** `frontend/e2e/bottom-nav.spec.ts`, spec `docs/specs/M1-03b-bottom-nav-profile.md` (AC-SYS-047/048/049/051 gốc), `reports/verification.md` (ghi nhận lúc `/ship M8-01a`)

## 1. Mục tiêu (1–3 câu, ngôn ngữ người dùng)
Là người duy trì CI/CD, tôi muốn `bottom-nav.spec.ts` chạy ổn định (không fail ngẫu nhiên rồi tự qua khi retry) để `make e2e`/`make verify` là tín hiệu tin được, không phải việc phải "chạy lại cho qua".

## 2. Phạm vi
- Trong phạm vi:
  - Xác định nguyên nhân gốc khiến test `AC-SYS-047 AC-SYS-051 @a11y @screenshot thanh dưới đáy của <role>` (dòng 55–87 file trên) đôi khi thấy nhãn menu không khớp `SLOTS[role]` — vai trò bị fail thay đổi giữa các lần chạy (manager/tech-lead/technician/sale-technician/sale), không cố định.
  - Sửa đúng nguyên nhân gốc (dữ liệu seed dùng chung giữa các spec file chạy song song, cache phía server bị đụng độ giữa request của nhiều user, thứ tự khởi tạo/đăng nhập, v.v.) — **không** che bằng cách thêm `retry`, `waitForTimeout`, hay làm mềm assertion đang có (`labels`, `aria-current`, vị trí `fixed`, chiều cao chạm ≥44px, axe a11y).
  - Nếu nguyên nhân là dữ liệu seed (`backend/scripts/seed_e2e.py`) hoặc cấu hình `playwright.config.ts` (`workers`, `fullyParallel`) — sửa trong phạm vi item này.
- Ngoài phạm vi (không làm ở item này):
  - `orders.spec.ts` AC-ORD-024 (flake timeout autocomplete khách hàng, đã biết từ `M3-08`, không liên quan) — giữ nguyên, không đụng.
  - Không đổi hành vi sản phẩm của thanh điều hướng dưới (nội dung/thứ tự `SLOTS`, ngưỡng 1024px, v.v.) — đó là spec `M1-03b`, đã Done.
  - `M8-04` (CSV injection `/kpi/report/export`) — item riêng, không liên quan.

## 3. Acceptance Criteria
> Đây là item sửa lỗi hạ tầng test (không phải tính năng sản phẩm), nên AC đo "độ ổn định" và "không che giấu flake" thay vì hành vi nghiệp vụ mới.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-SYS-098 | Stack dev đầy đủ (`make up`), dữ liệu seed mới (`seed_e2e.py` reset) | Chạy `npx playwright test e2e/bottom-nav.spec.ts` lặp lại 20 lần liên tiếp, `workers=2` (giống `make e2e`), không dùng `--retries` | Cả 20 lần: toàn bộ test trong file pass, không lần nào vai trò nào có nhãn/thuộc tính sai | e2e (stateful: chạy lặp) |
| AC-SYS-099 | Toàn bộ suite e2e hiện có (không chỉ file này) | Chạy `make e2e` 3 lần liên tiếp trên máy dev | Không có flake nào liên quan `bottom-nav.spec.ts` ở cả 3 lần (flake `orders.spec.ts` AC-ORD-024 nếu xảy ra không tính, đã biết và ngoài phạm vi) | e2e |
| AC-SYS-100 | Diff sửa lỗi của item này | Review code (không phải chạy máy) | Fix giải quyết nguyên nhân gốc đã xác định ở §8 (ví dụ: cô lập dữ liệu/tài khoản dùng chung, hoặc sửa đụng độ phía server) — không có `retry`, `test.slow()`, `waitForTimeout` cố định, hay nới assertion nào bị thêm vào để che giấu triệu chứng | review (test-auditor) |

## 4. API
Không có API mới. Nếu nguyên nhân gốc nằm ở backend (ví dụ cache/race điều kiện khi build menu theo user), ghi cụ thể endpoint/service bị ảnh hưởng vào §8 khi điều tra xong trước khi code.

## 5. Dữ liệu / Migration
Không có. Nếu nguyên nhân là tài khoản seed dùng chung giữa nhiều spec file (`backend/scripts/seed_e2e.py`), có thể cần thêm tài khoản e2e riêng cho `bottom-nav.spec.ts` — ghi rõ trong PR, không phải migration DB.

## 6. UI
Không đổi UI. Chỉ sửa test/hạ tầng test (và backend nếu nguyên nhân ở đó).

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
Không áp dụng — item này không có UI/luồng người dùng mới để chủ dự án duyệt bằng tay. Bằng chứng "xong" là log 20 lần chạy lặp (AC-SYS-098) đính kèm trong `reports/verification.md` khi `/ship`.

## 8. Giả định & câu hỏi
- **Chưa điều tra sâu tại thời điểm viết spec này** (theo đúng quy tắc "không viết code ở `/spec`"). Các giả thuyết ban đầu cần xác minh ở `/implement` trước khi chọn hướng sửa, liệt kê theo khả năng cao → thấp:
  1. Tài khoản e2e dùng chung (`khoa.shell@smyou.vn`, `ha.e2e@smyou.vn`, …) bị spec file khác chạy song song (`fullyParallel: true`, `workers=2`) đổi trạng thái liên quan (session, huy hiệu thông báo chưa đọc, v.v.) đúng lúc `bottom-nav.spec.ts` đọc `aria-hidden` nodes — nhưng test đã cố tình strip badge/icon trước khi so khớp nhãn (dòng 67–77), nên nếu đúng giả thuyết này, cần tìm vì sao chuỗi `textContent` còn lại (chỉ còn tên nhãn) vẫn sai — có thể do icon đổi mà text không đổi, hoặc badge không được strip hết.
  2. Đụng độ phía backend khi 2 worker gửi request đăng nhập/lấy menu đồng thời cho 2 user khác nhau — nếu có cache/biến toàn cục theo request (không theo user) khi build danh sách menu/capability, có thể trả nhầm kết quả giữa 2 request chạy song song. Đây là giả thuyết cần ưu tiên kiểm tra vì đúng với mô tả "vai trò fail đổi ngẫu nhiên mỗi lần" (không phải luôn 1 role cố định).
  3. Thứ tự seed/transaction chưa commit xong khi worker thứ 2 đăng nhập (ít khả năng vì `seed_e2e.py` chạy xong trước khi `make e2e` bắt đầu, không chạy song song với test).
- **Giả định mặc định đang dùng cho item này**: không cần hỏi chủ dự án — đây là lỗi kỹ thuật thuần (không có quy tắc nghiệp vụ mới), không ghi vào `OPEN_QUESTIONS.md`.
- Nếu điều tra ở `/implement` phát hiện nguyên nhân đòi hỏi đổi hành vi sản phẩm (không chỉ test/hạ tầng) — dừng và hỏi chủ dự án trước khi sửa, theo đúng CLAUDE.md.
