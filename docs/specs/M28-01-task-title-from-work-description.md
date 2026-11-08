# M28-01 — Tiêu đề + Mô tả đầu việc mặc định lấy từ "Mô tả công việc" của đơn

- **Status:** Approved (2026-11-08; Q193 đã chốt, sửa lần 2 cùng ngày: 100 ký tự + chép Mô tả)
- **Backlog:** M28-01 · **Milestone:** M28
- **Phụ thuộc:** M4-01b (panel "Tạo đầu việc" — `TaskCreateSheet`)
- **Liên quan:** `docs/specs/M4-01b-dispatch-task-create-ui.md`, `backend/app/modules/dispatch/schemas.py` (`Title` 1..200 ký tự)

## 1. Mục tiêu
Khi Quản lý kỹ thuật mở panel "Tạo đầu việc" của một đơn, ô "Tiêu đề đầu việc" và ô "Mô tả" được điền sẵn từ "Mô tả công việc" của đơn đó — đỡ gõ lại; người giao việc vẫn sửa được.

## 2. Phạm vi
- Trong phạm vi: `TaskCreateSheet` (dùng ở "Đơn chờ điều phối" và tab "Đầu việc" của đơn) — mọi lần mở panel (đầu việc thứ 1, 2, 3…, kể cả đơn đang Chỉnh sửa).
- Quy tắc (Q193, sửa 2026-11-08): **Tiêu đề** = 100 ký tự đầu của "Mô tả công việc" (ô tiêu đề 1 dòng: xuống dòng/khoảng trắng liên tiếp gộp thành 1 dấu cách, bỏ khoảng trắng 2 đầu, rồi cắt 100). **Mô tả** = chép nguyên văn đầy đủ "Mô tả công việc" (giữ xuống dòng).
- Mô tả công việc trống → 2 ô để trống như hiện tại (tiêu đề vẫn báo lỗi bắt buộc khi Lưu).
- Người dùng đã gõ/sửa ô nào thì ô đó không bị ghi đè (kể cả khi đơn nạp lại).
- Bản hướng dẫn Quản lý kỹ thuật: bước "Nhập Tiêu đề đầu việc" ghi rõ đã điền sẵn từ mô tả.
- Ngoài phạm vi: API (không đổi), sửa đầu việc đã tạo.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DSP-134 | Đơn có mô tả "Lắp 4 camera kho\nĐi dây âm tường" | mở "Tạo đầu việc" | Tiêu đề = "Lắp 4 camera kho Đi dây âm tường"; ô "Mô tả" = nguyên văn 2 dòng; Lưu gửi `title` + `description` đó | component |
| AC-DSP-135 | Mô tả dài 250 ký tự, có khoảng trắng/xuống dòng ở đầu | mở panel | Tiêu đề = 100 ký tự đầu (sau khi gộp khoảng trắng, bỏ 2 đầu); ô "Mô tả" = đủ 250 ký tự nguyên văn | component |
| AC-DSP-136 | Đơn có mô tả trống | mở panel, bấm Lưu | Tiêu đề trống; lỗi bắt buộc như cũ, không gọi API | component |
| AC-DSP-137 | Panel đã điền sẵn | người dùng xoá và gõ "Khảo sát mặt bằng" vào tiêu đề, xoá ô "Mô tả", Lưu | `title` = "Khảo sát mặt bằng", `description` = null | component |

## 4. API
Không đổi (`POST /orders/{id}/tasks`).

## 5. Dữ liệu / Migration
Không.

## 6. UI
Không đổi bố cục; chỉ giá trị mặc định của ô "Tiêu đề đầu việc" và "Mô tả".

## 7. Kịch bản UAT thủ công
1. Đơn có mô tả 2 dòng → Điều phối › Đơn chờ điều phối → mở đơn → tiêu đề = 100 ký tự đầu (1 dòng), Mô tả = đủ 2 dòng.
2. Tạo xong đầu việc 1, bấm tạo đầu việc 2 → 2 ô lại điền sẵn.

## 8. Giả định & câu hỏi
- Q193 (đã chốt 2026-11-08, sửa cùng ngày): tiêu đề = 100 ký tự đầu, Mô tả = chép đầy đủ; áp dụng mọi lần tạo đầu việc.
- Giả định: ô tiêu đề 1 dòng nên xuống dòng trong mô tả được gộp thành dấu cách trước khi cắt.
