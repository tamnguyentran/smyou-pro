# M11-02c — Lan style thẻ (bỏ viền, p-5) ra Điều phối, Việc của tôi, KPI, Nhật ký

- **Status:** Approved
- **Backlog:** M11-02c · **Milestone:** M11
- **Liên quan:** `docs/design/UI_GUIDELINES.md` §1.1 (nguyên tắc card không viền, trừ bảng/input/thẻ tô màu trạng thái — đã chốt ở M11-01), `docs/specs/M11-02a-ui-card-style-list-pages.md` + `docs/specs/M11-02b-ui-card-style-order-detail.md` (mẫu đã duyệt, cùng khuôn mẫu). Không đụng `spec/*.yaml`, không đổi API/DB/phân quyền.

## 1. Mục tiêu
Là chủ dự án, tôi muốn thẻ mobile ở trang Đơn chờ điều phối, Lịch & tải việc, Việc của tôi, KPI, Nhật ký có cùng style "nổi bằng bóng mờ, không viền" như các khu vực đã sửa ở M11-01/M11-02a/M11-02b, để toàn app nhất quán.

## 2. Phạm vi
- Trong phạm vi — đúng 1 đoạn `className` (nút/thẻ `<li>`/`<button>`) mỗi file, bỏ `border border-line`, giữ `shadow-card`/`hover:shadow-card-hover`, tăng `p-4` → `p-5`:
  1. `frontend/src/features/dispatch/components/DispatchQueueList.tsx:84` — nút thẻ đơn chờ điều phối (mobile)
  2. `frontend/src/features/dispatch/components/WorkloadList.tsx:128` — thẻ `<li>` tải việc theo KTV (mobile)
  3. `frontend/src/features/myTasks/components/MyAssignmentList.tsx:272` — thẻ `<li>` đầu việc của tôi (mobile)
  4. `frontend/src/features/kpi/components/KpiRows.tsx:29` — thẻ `<li>` KPI theo KTV (dùng ở **cả 2 viewport**, không có bảng desktop riêng)
  5. `frontend/src/features/audit/components/AuditEventList.tsx:117` — thẻ `<li>` nhật ký (mobile)
- **Không đụng** các `<table>` desktop của `DispatchQueueList` (dòng 28), `WorkloadList` (dòng 78), `MyAssignmentList` (dòng 201), `AuditEventList` (dòng 78) — giữ nguyên `border border-line` theo ngoại lệ "bảng" ở UI_GUIDELINES §1.1.
- **Không đụng** `GroupHeader` trong `WorkloadList.tsx` (dòng 52, class `headerClass` theo nhóm `NOT_STARTED`/`IDLE`...) — đây là viền tô màu theo trạng thái tải việc, thuộc ngoại lệ "thẻ đang tô màu theo trạng thái" ở UI_GUIDELINES §1.1, không phải viền trang trí.
- **Không đụng** `TaskBoardCard`/`TaskQueueList`/`RevisionQueueList` (đã xong ở M11-01, hoặc ngoài phạm vi khu vực này).
- Ngoài phạm vi (item sau, `M11-02d`): 3 trang form đơn lẻ (Đăng nhập, Đổi mật khẩu, Hồ sơ cá nhân).

## 3. Acceptance Criteria
> Thuần UI, không đổi API/quyền/trạng thái — không có AC 403/404/409/422. Kiểm chứng bằng class CSS render ra + test không-hồi-quy hiện có (component, e2e, lint).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-026 | `DispatchQueueList` render ≥1 đơn chờ điều phối, viewport mobile | render | nút thẻ đơn gốc có `shadow-card`, `hover:shadow-card-hover`, `p-5`; **không** có class `border`/`border-line`; bấm vẫn chọn đơn đúng 1 lần (không hồi quy luồng mở panel tạo task) | component |
| AC-UI-027 | `DispatchQueueList` render, viewport desktop | render | `table` gốc **vẫn giữ** `border border-line` (không đổi) | component (regression) |
| AC-UI-028 | `WorkloadList` render ≥1 KTV có tải việc, viewport mobile | render | thẻ `<li>` KTV gốc có `shadow-card`, `p-5`; không còn `border`/`border-line`; `GroupHeader` (viền màu theo nhóm `NOT_STARTED`/`IDLE`...) **vẫn giữ nguyên** class tô màu trạng thái | component |
| AC-UI-029 | `WorkloadList` render, viewport desktop | render | `table` gốc **vẫn giữ** `border border-line` (không đổi) | component (regression) |
| AC-UI-030 | `MyAssignmentList` render ≥1 đầu việc, viewport mobile, vai trò KTV | render | thẻ `<li>` gốc có `shadow-card`, `p-5`; không còn `border`/`border-line`; nút Tiếp nhận/Từ chối/Bắt đầu/Hoàn thành bên trong vẫn hiện & bấm được đúng như trước (không hồi quy AC-ASG-*) | component |
| AC-UI-031 | `MyAssignmentList` render, viewport desktop | render | `table` gốc **vẫn giữ** `border border-line` (không đổi) | component (regression) |
| AC-UI-032 | `KpiRows` render ≥1 dòng KTV, viewport mobile **và** desktop | render | thẻ `<li>` KPI gốc có `shadow-card`, `p-5` ở cả 2 viewport; không còn `border`/`border-line`; nội dung số liệu (Xong/Đúng hạn/Lỗi/giờ) không đổi vị trí | component |
| AC-UI-033 | `AuditEventList` render ≥1 sự kiện, viewport mobile | render | thẻ `<li>` gốc có `shadow-card`, `p-5`; không còn `border`/`border-line` | component |
| AC-UI-034 | `AuditEventList` render, viewport desktop | render | `table` gốc **vẫn giữ** `border border-line` (không đổi) | component (regression) |
| AC-UI-035 | Trang Đơn chờ điều phối, Lịch & tải việc, Việc của tôi, KPI, Nhật ký ở 390px và 1440px (e2e hiện có: `dispatch.spec.ts`, `myTasks.spec.ts`, `kpi.spec.ts`, `audit.spec.ts`) | chạy lại sau khi sửa | không có vi phạm axe-core `serious`/`critical` mới; không hồi quy điều hướng/lọc/hành động đã có | e2e |
| AC-UI-036 | `scripts/check_no_raw_colors` | chạy sau khi sửa 5 file trên | 0 vi phạm mới | lint |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Mỗi file chỉ đổi 1 class string của thẻ mobile (`<li>` hoặc `<button>`), theo đúng khuôn mẫu đã dùng ở M11-01/M11-02a/M11-02b: bỏ `border border-line`, giữ nguyên `shadow-card`/`hover:shadow-card-hover`, `p-4` → `p-5`.
- `KpiRows` là trường hợp đặc biệt: không có bảng desktop riêng (grid 1 cột mobile → nhiều cột desktop dùng cùng `<li>`), nên sửa 1 lần áp dụng cho cả 2 viewport — không có AC "desktop giữ nguyên" cho component này.
- Không đổi bố cục bên trong thẻ, không đổi copy, không đổi màu chữ/icon/badge trạng thái, không đổi hành vi bấm/điều hướng/nút hành động.
- Giữ nguyên `GroupHeader` tô màu theo nhóm trong `WorkloadList` — đây là tín hiệu quét nhanh theo trạng thái tải việc (UI_GUIDELINES §1.3), không phải viền trang trí.
- Bảng desktop (`<table>`) của `DispatchQueueList`, `WorkloadList`, `MyAssignmentList`, `AuditEventList` giữ nguyên hoàn toàn — nằm trong ngoại lệ "bảng" ở UI_GUIDELINES §1.1.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Mở trang Điều phối (390px) — thẻ đơn chờ điều phối không còn viền kẻ, có bóng mờ nhẹ; bấm vẫn mở panel tạo task như cũ.
2. Mở Lịch & tải việc (390px) — thẻ từng KTV bỏ viền; tiêu đề nhóm (Chưa thực hiện/Chưa có đầu việc...) vẫn giữ viền màu theo trạng thái như cũ.
3. Mở Việc của tôi (390px, vai trò KTV) — thẻ đầu việc bỏ viền; nút Tiếp nhận/Từ chối/Bắt đầu/Hoàn thành vẫn hoạt động đúng.
4. Mở KPI (390px và 1440px) — thẻ KPI từng KTV bỏ viền ở cả 2 kích thước màn hình.
5. Mở Nhật ký (390px) — thẻ sự kiện bỏ viền. Mở lại 4 trang trên (trừ KPI) ở máy tính (1440px) — bảng dữ liệu vẫn có viền như cũ, không đổi.

## 8. Giả định & câu hỏi
- Giả định: tiếp tục đúng khuôn mẫu đã duyệt ở M11-01 (nguyên tắc) và áp dụng lại y hệt cách làm ở M11-02a/M11-02b (class string), không có quyết định thiết kế mới.
- Giả định: `GroupHeader` trong `WorkloadList` và badge trạng thái trong các `<li>` khác không thuộc phạm vi — đây là viền/màu tô theo trạng thái (ngoại lệ UI_GUIDELINES §1.1), không phải viền trang trí của thẻ.
- Không có câu hỏi mới cần chủ dự án quyết — nguyên tắc đã chốt ở M11-01, item này chỉ áp dụng lại đúng khuôn mẫu lên khu vực điều phối/KPI/nhật ký.
