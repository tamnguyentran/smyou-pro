# M10-03 — Bấm thẻ thống kê Tổng quan để lọc danh sách

- **Status:** Approved
- **Backlog:** M10-03 · **Milestone:** M10
- **Liên quan:** `docs/specs/M7-02-role-dashboard.md` (nguồn `order_summary`/`dispatch_summary`, component `StatTile`/`OrderSummarySection`/`DispatchSummarySection`); `spec/permissions.yaml#order.read` (SALE scope `all` — khác với `dashboard.read` SALE scope `own`, xem Q82); `backend/app/modules/orders/service.py` `list_orders`/`RULES` (API `GET /orders` đã nhận `status` query param, chưa có `mine`); `frontend/src/features/orders/pages/OrdersListPage.tsx` (bộ lọc trạng thái hiện là `useState` cục bộ, không đọc URL); `frontend/src/features/dispatch/pages/DispatchQueuePage.tsx` (trang đã tự giới hạn đúng danh sách "chờ điều phối", không có tham số lọc nào).

## 1. Mục tiêu
Là Sale/Quản lý/Quản lý kỹ thuật, khi xem thẻ số liệu ở trang "Tổng quan", tôi muốn bấm vào thẻ để đi thẳng tới danh sách đã lọc sẵn đúng số liệu đó, để không phải tự mở trang khác rồi tự chọn lại bộ lọc.

## 2. Phạm vi
- Trong phạm vi:
  - 7 thẻ `order_summary` (mỗi trạng thái đơn) → bấm vào điều hướng tới `/orders?status=<STATUS>`, kèm `&mine=1` khi `order_summary.scope === "own"` (Sale xem đơn của mình).
  - Thẻ `dispatch_summary.pending_dispatch_count` ("Chờ điều phối") → bấm vào điều hướng tới `/dispatch/queue` (trang này đã luôn hiện đúng danh sách đơn `PENDING_DISPATCH`, không cần truyền tham số lọc).
  - `GET /api/v1/orders` thêm query param tuỳ chọn `mine: bool = false` — lọc thêm `Order.created_by == actor.id` **sau** scope hiện có của `order.read` (không đổi `permissions.yaml`, không mở rộng quyền — chỉ thu hẹp thêm kết quả actor đã được thấy).
  - `OrdersListPage`: đọc `status`/`mine` từ query string lúc vào trang để đặt giá trị lọc khởi tạo (chip trạng thái + checkbox "Chỉ đơn của tôi" mới, hiện cho mọi vai trò có `order.read`, mặc định bỏ chọn trừ khi `mine=1` trên URL).
  - `StatTile` thêm prop `to` tuỳ chọn: có `to` → render như link điều hướng (hover/focus rõ, giữ nguyên bố cục nhãn/số); không có `to` → giữ nguyên `<div>` như hiện tại (không đổi `task_summary`/`staff_summary`/`my_task_summary`).
- Ngoài phạm vi (không làm ở item này):
  - Thẻ `dispatch_summary.needs_assignee_count` ("Cần giao lại") và `overdue_task_count` ("Quá hạn") — không bấm được. Đây là số liệu theo **đầu việc**, không phải đơn; backlog item này chỉ định rõ 2 đích `/orders` hoặc `/dispatch/queue`, và `/dispatch/queue` chỉ hiện đơn `PENDING_DISPATCH` (không có tab/lọc theo đầu việc "cần giao lại"/"quá hạn" — xem `/dispatch/board`, `/dispatch/workload`). Không tự thêm tham số lọc mới cho 2 trang đó ở item này.
  - Toàn bộ `task_summary`, `staff_summary`, `my_task_summary`, `today_tasks` — không bấm được (không nằm trong 2 đích backlog đã nêu).
  - Đồng bộ URL ↔ bộ lọc hai chiều liên tục trên `/orders` (ví dụ tự cập nhật URL khi người dùng đổi chip sau khi đã vào trang) — chỉ cần áp giá trị khởi tạo từ URL lúc tải trang.
  - Đổi scope/capability `order.read` hiện có (Sale gọi trực tiếp `/orders` không qua Tổng quan vẫn thấy toàn công ty như cũ — `mine` chỉ là lọc thêm tuỳ chọn).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| ~~AC-DASH-022~~ (→ M18-01a: thẻ mở popup) | Hoa (SALE); `order_summary.scope = "own"`; Hoa có 3 đơn `PENDING_DISPATCH` của mình, công ty có thêm 5 đơn `PENDING_DISPATCH` của An | Hoa bấm thẻ "Chờ điều phối" ở trang Tổng quan | Điều hướng tới `/orders?status=PENDING_DISPATCH&mine=1`; trang `/orders` tải với chip "Chờ điều phối" đang chọn, checkbox "Chỉ đơn của tôi" đã tick; danh sách trả về đúng 3 đơn (không có 5 đơn của An) | component + e2e |
| ~~AC-DASH-023~~ (→ M18-01a: thẻ mở popup) | An (MANAGER); `order_summary.scope = "all"`; công ty có 4 đơn `COMPLETED` (nhiều Sale tạo) | An bấm thẻ "Hoàn tất" | Điều hướng tới `/orders?status=COMPLETED` (không có `mine`); trang tải với chip "Hoàn tất" đã chọn, checkbox "Chỉ đơn của tôi" **không** tick; danh sách trả đủ 4 đơn | component + e2e |
| AC-DASH-024 | Hoa (SALE) gọi trực tiếp `GET /api/v1/orders?status=PENDING_DISPATCH&mine=true` | — | 200; chỉ trả đơn có `created_by = Hoa.id` **và** `status = PENDING_DISPATCH` trong tập đơn Hoa đã được `order.read` cho thấy (SALE scope `all` → không giới hạn thêm bởi scope, chỉ bởi `mine`) | integration |
| AC-DASH-025 | Bất kỳ actor hợp lệ; không truyền `mine` | gọi `GET /api/v1/orders?status=X` (như trước đây) | 200; hành vi giống hệt trước khi thêm tham số `mine` (không lọc thêm theo `created_by`) — không hồi quy | integration |
| ~~AC-DASH-026~~ (→ M18-01a: thẻ mở popup) | Đơn theo trạng thái `DRAFT` của Hoa = 0 | Hoa bấm thẻ "Nháp" (giá trị 0) | Vẫn điều hướng được tới `/orders?status=DRAFT&mine=1`; trang hiện danh sách trống (không lỗi) — thẻ số 0 vẫn bấm được, không bị vô hiệu hoá | component |
| ~~AC-DASH-027~~ (→ M18-01a: thẻ mở popup) | Tuấn (TECH_LEAD) ở trang Tổng quan, `dispatch_summary.pending_dispatch_count = 4` | Tuấn bấm thẻ "Chờ điều phối" | Điều hướng tới `/dispatch/queue` (không query param); trang hiện đúng danh sách đơn chờ điều phối như khi vào bằng menu | component + e2e |
| ~~AC-DASH-028~~ (→ M18-01a: thẻ mở popup) | Tuấn (TECH_LEAD) ở trang Tổng quan, `dispatch_summary.needs_assignee_count = 3`, `overdue_task_count = 1` | render | 2 thẻ "Cần giao lại"/"Quá hạn" vẫn hiện số và tông màu `urgent` như `M7-02` nhưng **không** phải link — không có `href`, không đổi con trỏ chuột khi hover, bấm vào không điều hướng | component |
| ~~AC-DASH-029~~ (→ M18-01b: thẻ mở popup) | Tuấn (TECH_LEAD) ở trang Tổng quan (có cả `task_summary`, `staff_summary`) | render | Các thẻ của `task_summary`/`staff_summary` vẫn là `<div>` như `M7-02`, không có affordance bấm được | component |
| ~~AC-DASH-030~~ (→ M18-01a: thẻ mở popup) | Hoa (SALE) ở trang Tổng quan, dùng bàn phím (Tab) | Tab tới thẻ "Chờ điều phối", nhấn Enter | Focus có viền rõ (focus-visible); Enter điều hướng giống khi bấm chuột tới `/orders?status=PENDING_DISPATCH&mine=1` | component |
| AC-DASH-031 | Hoa (SALE) mở Tổng quan trên mobile (390px) | render | Thẻ `order_summary` vẫn đạt vùng chạm ≥44px, bấm được bằng ngón tay, không đổi layout lưới 2 cột đã có ở `M7-02` | component |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/orders | order.read (không đổi) | thêm query param tuỳ chọn `mine?: boolean` (mặc định `false`) bên cạnh `q`/`status`/`sort`/`limit`/`offset` hiện có | `OrderPage` (không đổi schema) | không đổi |

`mine=true`: thêm điều kiện `Order.created_by == actor.id` vào câu lệnh sau khi `apply_scope` đã áp theo `order.read`. Không ảnh hưởng `order.read`'s scope rules, không đổi `permissions.yaml`.

## 5. Dữ liệu / Migration
Không có bảng/cột mới.

## 6. UI
- `StatTile` (`frontend/src/features/dashboard/components/StatTile.tsx`): thêm prop `to?: string`. Có `to` → bọc nội dung trong `<Link to={to}>` (react-router), thêm `focus-visible:ring`/hover nhẹ (nền sẫm hơn 1 nấc), giữ layout/màu tone cũ. Không có `to` → giữ `<div>` như hiện tại.
- `OrderSummarySection`: mỗi `StatTile` nhận `to={`/orders?status=${status}${summary.scope === "own" ? "&mine=1" : ""}`}`.
- `DispatchSummarySection`: chỉ thẻ "Chờ điều phối" nhận `to="/dispatch/queue"`; "Cần giao lại"/"Quá hạn" không nhận `to` (giữ nguyên, không link).
- `OrdersListPage`: đọc `useSearchParams()` một lần lúc mount để khởi tạo `status`/`mine`; thêm checkbox "Chỉ đơn của tôi" cạnh `ChipGroup` trạng thái (mobile: xếp dưới ô tìm kiếm; desktop: cùng hàng với chip). Checkbox đổi `filters.mine`, reset `offset` về 0 khi đổi — không cập nhật lại URL khi người dùng tự đổi lọc sau đó (ngoài phạm vi §2).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Hoa (SALE), có vài đơn `PENDING_DISPATCH` → mở "Tổng quan" → bấm thẻ "Chờ điều phối" → thấy đúng đơn của Hoa, checkbox "Chỉ đơn của tôi" đã tick.
2. Bỏ tick checkbox đó → thấy thêm đơn `PENDING_DISPATCH` của người khác (xác nhận `order.read` scope `all` vẫn không đổi).
3. Đăng nhập Tuấn (TECH_LEAD) → mở "Tổng quan" → bấm thẻ "Chờ điều phối" (khối Điều phối) → tới `/dispatch/queue`, danh sách khớp.
4. Ở trang Tổng quan của Tuấn, thử bấm vào thẻ "Cần giao lại"/"Quá hạn" → xác nhận không có gì xảy ra (không phải link).

## 8. Giả định & câu hỏi
- Câu hỏi mới (Q82): `dashboard.read` cho Sale dùng scope "own" (chỉ đơn do Sale tạo) nhưng `order.read` (capability của trang `/orders`) cho Sale lại là scope "all" (toàn công ty) — 2 giá trị khác nhau trong `permissions.yaml` cho cùng vai trò. Khi Sale bấm thẻ từ Tổng quan, số trên thẻ (đếm theo "own") có nên khớp đúng danh sách hiện ra không, hay chấp nhận Sale thấy nhiều hơn số đã đếm? Đề xuất mặc định: khớp đúng — thêm tham số lọc `mine` **chỉ lọc hẹp thêm** (không đổi `order.read` scope hiện có cho các lượt gọi khác), kèm checkbox để Sale tự bỏ lọc nếu muốn xem rộng hơn.
- Giả định: `needs_assignee_count`/`overdue_task_count`/`task_summary`/`staff_summary`/`my_task_summary`/`today_tasks` không có đích lọc sẵn phù hợp trong phạm vi backlog nêu (`/orders` hoặc `/dispatch/queue`) → không bấm được ở item này, để lại item sau nếu chủ dự án cần (có thể cần thêm lọc URL mới cho `/dispatch/board`/`/dispatch/workload`, ngoài phạm vi item này).
- Giả định: không cần đồng bộ URL hai chiều liên tục trên `/orders` sau khi vào trang (chỉ cần đọc 1 lần lúc tải) — giữ đúng tinh thần "lát cắt dọc nhỏ", có thể làm thêm sau nếu cần chia sẻ link đã lọc.
