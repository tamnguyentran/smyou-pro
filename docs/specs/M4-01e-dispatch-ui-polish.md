# M4-01e — Đánh bóng UI điều phối

- **Status:** Approved
- **Backlog:** M4-01e · **Milestone:** M4
- **Liên quan:** `reports/review-M4-01b.md` #5–#8, spec `M4-01b-dispatch-task-create-ui.md`, `M4-01c-order-tasks-tab.md`. Không đụng `spec/*.yaml`, không đổi API/DB/phân quyền (chỉ frontend, ~60–90 dòng non-test).

## 1. Mục tiêu
Là Quản lý kỹ thuật dùng điện thoại, tôi muốn panel "Tạo đầu việc" báo đúng khi không tải được danh sách kỹ thuật viên (và cho thử lại), thẻ hàng đợi hiển thị rõ ngày hẹn/người tạo, và nút chính dễ bấm — để không giao việc nhầm do thông tin sai hoặc thiếu.

## 2. Phạm vi
- Trong phạm vi (4 mục, đều là frontend):
  1. `TaskCreateSheet`/`AssigneePicker`: khi `GET /employees` lỗi → hiện thông báo lỗi + nút "Thử lại" (thay cho câu sai "Không có kỹ thuật viên nào đang hoạt động."); câu đó chỉ hiện khi tải **thành công** và danh sách rỗng.
  2. `DispatchQueueList` (thẻ mobile): thêm nhãn "Ngày hẹn:" (và "Chưa hẹn ngày" thay cho "—" trần), thêm dòng "Người tạo: …".
  3. Nút chính trong footer `TaskCreateSheet` rộng `w-full sm:w-auto` trên mobile.
  4. Bỏ ép kiểu `order.priority as Priority` ở `TaskCreateSheet` và `DispatchQueueList`; dùng type guard `isPriority()` (đặt trong `orders/schemas.ts`) với fallback (§8, Q66).
- Ngoài phạm vi: `as Priority` ở `DraftOrderForm`/`OrderInfoTab` (module đơn hàng, ghi nhận ở §8); picker ngày giờ; guard `order_line_ids` (M4-02); đổi API.

## 3. Acceptance Criteria
> Component UI thuần, không có yếu tố vai trò/quyền mới (trang đã giới hạn bởi capability `dispatch.queue.view`/`task.create` ở M4-01b; không thêm AC 403/404/409/422 vì không đổi API).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DSP-038 | Quản lý kỹ thuật mở "Tạo đầu việc — DH2609-0001"; `GET /orders/{id}` OK, `GET /employees` trả 500 | panel tải xong | panel hiện vùng `role=alert` "Không tải được danh sách kỹ thuật viên." + nút "Thử lại"; **không** hiện câu "Không có kỹ thuật viên nào đang hoạt động."; nút "Tạo đầu việc" ở footer vẫn bấm được nhưng submit báo lỗi validate "Chọn ít nhất một kỹ thuật viên" như AC-DSP-023 | component |
| AC-DSP-039 | Như AC-DSP-038 | bấm "Thử lại"; lần gọi `GET /employees` này trả 2 KTV (Lê Văn Hùng · NV004, Phạm Quốc Bảo · NV007) | `GET /employees` được gọi lại đúng 1 lần; thông báo lỗi biến mất; danh sách 2 checkbox hiện ra; các trường form đã nhập (tiêu đề "Lắp camera cổng sau") giữ nguyên | component |
| AC-DSP-040 | `GET /employees` trả 200 với danh sách rỗng | mở panel | hiện "Không có kỹ thuật viên nào đang hoạt động."; **không** hiện thông báo lỗi/nút "Thử lại" | component |
| AC-DSP-041 | Hàng đợi có ĐH DH2609-0003 (khách "Công ty TNHH Việt Tiến", ngày hẹn 2026-10-05, người tạo "Nguyễn Thị Mai") trên viewport 390px | xem thẻ | thẻ có dòng "Ngày hẹn: 05/10/2026" và dòng "Người tạo: Nguyễn Thị Mai" | component + e2e (mobile) |
| AC-DSP-042 | ĐH không có ngày hẹn và `created_by_name = null` | xem thẻ mobile | hiện "Ngày hẹn: Chưa hẹn ngày" và "Người tạo: —"; không còn dấu "—" đứng trần không nhãn | component |
| AC-DSP-043 | Như AC-DSP-041 trên desktop 1440px | xem bảng | bảng giữ nguyên các cột "Mã, Khách, Ưu tiên, Ngày hẹn, Tổng tiền, Người tạo" (không đổi, không có nhãn "Ngày hẹn:" trong ô) | component |
| AC-DSP-044 | Panel "Tạo đầu việc" sẵn sàng, viewport 390px | đo footer | nút "Tạo đầu việc" chiếm ≥ 45% bề rộng footer (hiện ~55% của cả hàng nhưng nút nhỏ, không đều) và cao ≥ 44px; ở ≥ 640px (`sm`) nút trở về bề rộng theo nội dung | e2e (mobile + desktop) |
| AC-DSP-045 | Đơn có `priority = "HIGH"` | mở panel / xem thẻ | ô độ ưu tiên mặc định "Cao"; huy hiệu thẻ "Cao" (hành vi cũ giữ nguyên) | component |
| AC-DSP-046 | Server trả đơn có `priority = "CRITICAL"` (giá trị lạ, ngoài enum) | xem thẻ hàng đợi / mở panel | không văng lỗi; huy hiệu hiện đúng chuỗi "CRITICAL" tông trung tính (`neutral`); ô độ ưu tiên của task mặc định "Bình thường" (`NORMAL`) | unit (`isPriority`) + component |
| AC-DSP-047 | Toàn bộ test component/e2e dispatch hiện có (AC-DSP-015…037) | chạy lại | xanh, **không sửa assertion** (chỉ sửa selector nếu DOM đổi, nêu rõ trong báo cáo); không còn `as Priority` trong `features/dispatch/**` | component + e2e |

## 4. API
Không có (dùng lại `GET /api/v1/employees`, `GET /api/v1/orders`).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Lỗi tải KTV: khung nhỏ viền `urgent`, chữ "Không tải được danh sách kỹ thuật viên." + `Button` variant secondary "Thử lại" (≥ 44px); `AssigneePicker` nhận thêm prop `loadError`/`onRetry` — `TaskCreateSheet` truyền `technicians.isError` và `technicians.refetch`.
- Thẻ mobile: các dòng phụ dạng `Ngày hẹn: 05/10/2026`, `Người tạo: Nguyễn Thị Mai` (chữ `text-sm text-body`, nhãn `text-muted`… dùng `text-body` nếu nền hover làm tụt tương phản như ở AssigneePicker).
- Footer panel: `div` chứa nút dùng `[&>*]:flex-1 sm:[&>*]:flex-none` (hoặc `w-full sm:w-auto` trên từng nút).
- Copy chính xác: "Không tải được danh sách kỹ thuật viên." · "Thử lại" · "Ngày hẹn:" · "Chưa hẹn ngày" · "Người tạo:".

## 7. Kịch bản UAT thủ công (cho chủ dự án)
1. Mở `/dispatch/queue` trên điện thoại: thẻ có dòng "Ngày hẹn: …" và "Người tạo: …".
2. Bấm một đơn → panel "Tạo đầu việc": nút "Tạo đầu việc" và "Đóng" rộng đều, dễ bấm.
3. (Dev) tắt API `/employees` rồi mở panel: thấy lỗi + "Thử lại", không thấy câu "Không có kỹ thuật viên…"; bật lại, bấm "Thử lại" → danh sách hiện.

## 8. Giả định & câu hỏi
- Giả định: gộp 4 mục thành một item (dưới ngưỡng 400 dòng, không cần tách).
- **Q66 (mới, cần duyệt):** khi server trả `priority` ngoài enum, hiển thị gì? Đề xuất: huy hiệu hiện nguyên chuỗi tông `neutral`; mặc định form task = `NORMAL`. Đã thêm vào `OPEN_QUESTIONS.md`.
- Giả định "Chưa hẹn ngày" thay cho "—" ở thẻ mobile (chỉ mobile; bảng desktop giữ "—" như M4-01b). Sửa nếu bạn muốn cũng đổi desktop.
- Còn `as Priority` ở `DraftOrderForm`/`OrderInfoTab` (module đơn hàng): ngoài phạm vi, có thể gom vào một item riêng nếu muốn đồng bộ.
