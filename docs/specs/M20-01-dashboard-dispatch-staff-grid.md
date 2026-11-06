# M20-01 — Tổng quan: lưới 4 thẻ cho "Điều phối" và "Nhân sự kỹ thuật"

- **Status:** Approved
- **Backlog:** M20-01 · **Milestone:** M20
- **Liên quan:** M7-02 (role dashboard), M10-07b (thứ tự 4 thẻ nhân sự, AC-DASH-042), M18-01a/b (popup thẻ). Không đổi `spec/*.yaml`.

## 1. Mục tiêu
Là Quản lý kỹ thuật, tôi muốn 4 thẻ của mục "Điều phối" và 4 thẻ của mục "Nhân sự kỹ thuật" nằm gọn trên **1 hàng** ở tablet/desktop (hiện đang 3 + 1 lẻ) và **2 hàng × 2 thẻ** trên điện thoại, để nhìn nhanh, không có thẻ lẻ hàng.

## 2. Phạm vi
- Trong phạm vi: class lưới của `DispatchSummarySection` và `StaffSummarySection` (`frontend/src/features/dashboard/components/`). Áp dụng cho mọi vai trò thấy 2 mục này (QLKT, Quản lý) — cùng một component.
- Ngoài phạm vi: các mục khác của Tổng quan (Đơn hàng, Đầu việc, CSKH, Đánh giá, Việc của tôi…) giữ nguyên lưới hiện tại; không đổi API, quyền, nội dung/thứ tự thẻ, popup chi tiết.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-052 | QLKT Phạm Văn Tuấn đăng nhập; dashboard có `dispatch_summary` (Chờ điều phối 3, Đang thực hiện 5, Cần giao lại 1, Quá hạn 2) | mở Tổng quan | lưới của mục "Điều phối" có class `grid-cols-2` và `md:grid-cols-4`, **không** còn `md:grid-cols-3`; vẫn đủ 4 thẻ theo thứ tự cũ | component |
| AC-UI-053 | Như trên, có `staff_summary` (Đang làm 2, Chưa tiếp nhận 1, Chưa thực hiện 3, Chờ giao việc 1) | mở Tổng quan | lưới của mục "Nhân sự kỹ thuật" có class `grid-cols-2` và `md:grid-cols-4`, không còn `md:grid-cols-3`; thứ tự 4 thẻ giữ như AC-DASH-042 | component |
| AC-UI-054 | QLKT Tuấn, viewport 390px | mở Tổng quan | mỗi mục "Điều phối"/"Nhân sự kỹ thuật": 4 thẻ xếp 2 hàng × 2 cột (thẻ 1–2 cùng `top`, thẻ 3–4 cùng `top` và thấp hơn); mỗi thẻ cao ≥ 44px; không cuộn ngang | e2e (mobile) |
| AC-UI-055 | QLKT Tuấn, viewport 1440px (và 768px tablet) | mở Tổng quan | mỗi mục: cả 4 thẻ cùng `top` (1 hàng), rộng bằng nhau; nhãn dài nhất "Chưa thực hiện"/"Chờ điều phối" không bị cắt/tràn; không cuộn ngang | e2e (desktop) |
| AC-UI-056 | Như AC-UI-052 | bấm thẻ "Quá hạn" | vẫn mở popup chi tiết như M18-01a (hồi quy — đổi lưới không ảnh hưởng hành vi bấm) | component |

## 4. API
Không đổi.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `DispatchSummarySection`, `StaffSummarySection`: `grid grid-cols-2 gap-3 md:grid-cols-4` (thay `md:grid-cols-3`). Tablet = breakpoint `md` (≥768px) theo UI_GUIDELINES.
- Skeleton loading (`DashboardSkeleton`) giữ nguyên (`md:grid-cols-3 lg:grid-cols-4`) — dùng chung cho mọi vai trò.
- Screenshot 390px + 1440px vào `reports/screenshots/`.

## 7. Kịch bản UAT thủ công
1. Đăng nhập tài khoản QLKT, mở Tổng quan trên máy tính → mục "Điều phối" và "Nhân sự kỹ thuật" mỗi mục 4 thẻ trên 1 hàng.
2. Mở trên điện thoại (hoặc thu nhỏ trình duyệt ~390px) → mỗi mục 2 hàng, mỗi hàng 2 thẻ.
3. Bấm 1 thẻ bất kỳ → popup chi tiết vẫn mở như trước.

## 8. Giả định & câu hỏi
- Giả định G1: "tablet" = từ 768px (`md:`), áp 4 cột từ đó; ở 768px có sidebar hay không vẫn đủ chỗ vì thẻ chỉ có nhãn ngắn + số.
- Giả định G2: chỉ đổi 2 mục được nêu; Quản lý (vai trò Manager) thấy cùng component nên cũng nhận lưới mới — không có lý do để khác.
- Không có câu hỏi nghiệp vụ mới.
