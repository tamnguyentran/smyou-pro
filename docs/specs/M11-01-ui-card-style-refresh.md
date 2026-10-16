# M11-01 — Làm mới style thẻ (card) theo hướng thoáng, ít viền

- **Status:** Done
- **Backlog:** M11-01 · **Milestone:** M11
- **Liên quan:** `docs/design/UI_GUIDELINES.md` §1 (Nguyên tắc), §2 (Design tokens), `frontend/src/styles/index.css`. Không đụng `spec/*.yaml`, không đổi API/DB/phân quyền (chỉ frontend + docs, ước lượng ~40–60 dòng non-test).

## 1. Mục tiêu
Là chủ dự án, tôi muốn các thẻ (card) thông tin trên Tổng quan, Việc của tôi, Bảng đầu việc, KPI trông thoáng và hiện đại hơn (nổi bằng bóng mờ thay vì viền cứng, nhiều khoảng trắng hơn) — lấy cảm hứng bố cục từ ảnh tham khảo (OpenSTEM) nhưng **giữ nguyên** màu thương hiệu Deep Slate Teal `#0F2F2E` / amber `#D97706`, không đổi sang tông tím của ảnh tham khảo.

## 2. Phạm vi
- Trong phạm vi (làm trước, làm mẫu để duyệt rồi mới lan ra các trang khác ở item sau):
  1. Cập nhật `UI_GUIDELINES.md` §1: thêm nguyên tắc "Card nổi bằng `shadow-card`, bỏ viền (`border-line`) trừ khi cần phân tách mạnh (bảng, input, hoặc thẻ đang tô màu theo trạng thái)".
  2. 4 component mẫu — bỏ `border border-line`, giữ/thêm `shadow-card`, tăng padding `p-4` → `p-5`:
     - `frontend/src/features/dashboard/components/StatTile.tsx` (chỉ nhánh trung tính, không tone; nhánh có `tone` tô màu theo trạng thái **giữ nguyên viền màu** để không giảm độ nổi bật cảnh báo).
     - `frontend/src/features/dashboard/components/TodayTaskCard.tsx`
     - `frontend/src/features/dispatch/components/TaskBoardCard.tsx`
     - `frontend/src/features/kpi/components/KpiSelfCard.tsx` (cả 2 `div` trong file).
- Ngoài phạm vi (item sau, sau khi chủ dự án duyệt mẫu này):
  - Áp style cho các card/bảng còn lại (danh sách đơn, danh sách khách hàng, màn hình chi tiết…).
  - Đổi Button, Sidebar, Top bar, bảng màu, typography, spacing tổng thể.
  - Đổi token màu thương hiệu (giữ nguyên `--color-brand`, `--color-accent`).

## 3. Acceptance Criteria
> Thay đổi thuần UI, không có yếu tố vai trò/quyền/trạng thái mới — không thêm AC 403/404/409/422 vì không đổi API. Kiểm chứng bằng class CSS render ra và test không-hồi-quy hiện có.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-001 | `StatTile` không truyền `tone` (hoặc `value=0`) | render `<StatTile label="Tổng đơn" value={0} />` | `div` gốc có `shadow-card` và `bg-card`; **không** có class `border`/`border-line`; có `rounded-2xl` và `p-5` | component |
| AC-UI-002 | `StatTile` truyền `tone="urgent"` và `value={3}` | render | `div` gốc vẫn giữ `border-urgent-border bg-urgent-bg` như hiện tại (không bỏ viền ở nhánh tô màu trạng thái) | component (regression) |
| AC-UI-003 | `TodayTaskCard` render 1 task bất kỳ | render | `li` gốc có `shadow-card`, `p-5`; **không** còn `border border-line` | component |
| AC-UI-004 | `TaskBoardCard` render 1 task trên Bảng đầu việc | render | `button` gốc có `shadow-card` và `hover:shadow-card-hover` (giữ nguyên); **không** còn `border border-line` | component |
| AC-UI-005 | `KpiSelfCard` ở cả trạng thái chưa có dữ liệu (hiện "—") và đã có dữ liệu | render cả 2 | cả 2 `div` gốc có `shadow-card`, `p-5`; **không** còn `border border-line` | component |
| AC-UI-006 | Trang Tổng quan, Việc của tôi, Bảng đầu việc ở 390px và 1440px (test e2e hiện có) | chạy lại sau khi sửa | không có vi phạm axe-core `serious`/`critical` mới; `scrollWidth <= clientWidth` vẫn đúng (không hồi quy) | e2e |
| AC-UI-007 | `scripts/check_no_raw_colors` (lint màu rời rạc) | chạy sau khi sửa 4 component trên | 0 vi phạm mới | lint |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Hiệu ứng: card trung tính chuyển từ "nền trắng + viền `#E2E8F0` 1px + bóng rất nhẹ" sang "nền trắng + **không viền** + `shadow-card` rõ hơn một chút khi hover (`shadow-card-hover` nơi đã có)". Card đang tô màu theo trạng thái (StatTile có `tone`, badge trạng thái) **giữ nguyên viền màu** — không áp style mới vào đó vì viền màu là tín hiệu quét nhanh (UI_GUIDELINES §1.3), không phải viền trang trí.
- Padding trong các card mẫu tăng từ `p-4` lên `p-5` (khoảng trắng thoáng hơn, giống ảnh tham khảo).
- Không đổi bố cục (vị trí phần tử trong card), không đổi copy, không đổi màu chữ/icon.
- Không có khác biệt hành vi mobile vs desktop ngoài các breakpoint đã có sẵn.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Mở Tổng quan trên điện thoại (390px) — các thẻ "Tổng đơn/Quá hạn/…" không còn viền kẻ, có bóng mờ nhẹ, khoảng trắng bên trong rộng hơn trước.
2. Thẻ đang cảnh báo (ví dụ "Quá hạn" > 0) vẫn có nền + viền màu đỏ như trước — không bị mất tín hiệu cảnh báo.
3. Mở "Việc của tôi" — thẻ task cũng bỏ viền, có bóng mờ.
4. Mở Bảng đầu việc (desktop 1440px) — thẻ task trên board bỏ viền, hover vẫn nổi bóng rõ hơn.
5. Mở KPI cá nhân — thẻ điểm KPI bỏ viền, có bóng mờ.

## 8. Giả định & câu hỏi
- Giả định: chỉ bỏ viền ở card **trung tính** (không mang thông tin trạng thái qua màu); card tô màu theo trạng thái (badge, `StatTile` có `tone`) giữ nguyên viền màu vì đó là tín hiệu quét nhanh theo UI_GUIDELINES §1.3, không phải viền trang trí đơn thuần.
- Giả định: không đổi `--shadow-card`/`--shadow-card-hover` (giá trị rgba hiện có) — chỉ đổi cách dùng (bỏ `border`, tăng `p-4`→`p-5`), tránh rủi ro ảnh hưởng tương phản đã qua kiểm Lighthouse/axe.
- Đây là item **mẫu/thí điểm** trên 4 component; nếu chủ dự án duyệt hướng này, các trang/card còn lại sẽ làm ở item `M11-02` (chưa viết spec).
