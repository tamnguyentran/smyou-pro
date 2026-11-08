# M28-02 — Hạn hoàn thành mặc định = bây giờ + giờ ước tính, theo giờ làm việc

- **Status:** Approved (2026-11-08; Q194 đã chốt)
- **Backlog:** M28-02 · **Milestone:** M28
- **Phụ thuộc:** M4-01b (panel "Tạo đầu việc"), M28-01
- **Liên quan:** `frontend/src/features/dispatch/schemas.ts` (`hoursValid`, `toOffsetIso`), AC-DSP-020 (gợi ý số giờ)

## 1. Mục tiêu
Khi giao việc, ô "Hạn hoàn thành" tự điền = thời điểm hiện tại + "Số giờ ước tính", chỉ tính trong giờ làm việc, để Quản lý kỹ thuật không phải tự nhẩm.

## 2. Phạm vi
- Trong phạm vi: `TaskCreateSheet` (mọi nơi mở panel "Tạo đầu việc"). Hàm thuần `defaultDueAt(now, hours)` tính theo giờ Asia/Ho_Chi_Minh (không phụ thuộc múi giờ máy).
- Quy tắc (Q194):
  - Ngày làm việc: Thứ 2 – Thứ 7 (bỏ Chủ nhật). Giờ làm: 08:00–12:00 và 13:00–17:00 (8 giờ/ngày, trừ nghỉ trưa).
  - Điểm bắt đầu = bây giờ, làm tròn **lên** bội 15 phút; nếu rơi ngoài giờ làm → dời tới đầu khung làm việc kế tiếp (trước 08:00 → 08:00; 12:00–13:00 → 13:00; từ 17:00 hoặc Chủ nhật → 08:00 ngày làm việc kế).
  - Cộng dần số giờ ước tính trong các khung làm việc; phần vượt 12:00 tiếp từ 13:00, vượt 17:00 tiếp từ 08:00 ngày làm việc kế. Kết thúc đúng 12:00/17:00 thì hạn là 12:00/17:00.
  - Số giờ trống/không hợp lệ → không điền (ô giữ nguyên/trống).
  - Tự tính lại mỗi khi "Số giờ ước tính" đổi (kể cả gợi ý từ dịch vụ), **trừ khi** người dùng đã tự sửa "Hạn hoàn thành" trong lần mở panel đó.
- Ngoài phạm vi: ngày lễ, sửa đầu việc (`TaskEditSheet`), API (không đổi).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DSP-138 | Thứ 2 09:00 / 15:00 | +2 giờ | 11:00 / 17:00 cùng ngày | unit |
| AC-DSP-139 | Thứ 2 10:37 | +2 giờ | Bắt đầu 10:45, vượt 12:00 → tiếp 13:00 → 13:45 | unit |
| AC-DSP-140 | Thứ 2 15:00 +4 giờ; Thứ 2 08:00 +20 giờ | tính | Thứ 3 10:00; Thứ 4 12:00 | unit |
| AC-DSP-141 | Thứ 7 16:00 +3 giờ; Chủ nhật 10:00 +1 giờ | tính | Thứ 2 10:00; Thứ 2 09:00 (bỏ Chủ nhật) | unit |
| AC-DSP-142 | Thứ 2 06:30 / 12:20 / 18:00 | +1 giờ | 09:00 / 14:00 / Thứ 3 09:00 | unit |
| AC-DSP-143 | Panel mở lúc Thứ 4 10:00, đơn gợi ý 9 giờ | mở panel; đổi số giờ thành 3 | "Hạn hoàn thành" điền sẵn Thứ 5 11:00, rồi đổi thành 14:00 Thứ 4; Lưu gửi `due_at` đó (+07:00) | component |
| AC-DSP-144 | Người dùng đã tự sửa "Hạn hoàn thành" | đổi số giờ | Hạn giữ giá trị người dùng nhập | component |
| AC-DSP-145 | Đơn không có dịch vụ khai giờ (số giờ trống) | mở panel | "Hạn hoàn thành" trống | component |

## 4. API
Không đổi.

## 5. Dữ liệu / Migration
Không.

## 6. UI
Không đổi bố cục; chỉ giá trị mặc định của "Hạn hoàn thành".

## 7. Kịch bản UAT thủ công
1. 15:00 Thứ 2, giao đầu việc 4 giờ → hạn 10:00 Thứ 3.
2. 16:00 Thứ 7, 3 giờ → hạn 10:00 Thứ 2.
3. Sửa tay hạn rồi đổi số giờ → hạn không bị ghi đè.

## 8. Giả định & câu hỏi
- Q194 (đã chốt 2026-11-08): bỏ Chủ nhật; trừ nghỉ trưa 12–13; ngoài giờ bắt đầu từ khung làm việc kế; tự tính lại, làm tròn lên 15 phút.
- Chưa xét ngày lễ (ngoài phạm vi).
