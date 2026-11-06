# UAT-02 — Huỷ đơn có đầu việc đã huỷ, CSKH nhận thông báo đơn của mình, Manager đủ vai trò

- **Status:** Approved (chủ dự án chốt Q183–Q185, 2026-11-06)
- **Backlog:** UAT-02 · **Milestone:** UAT
- **Liên quan:** spec/state_machines.yaml#order.transitions[cancel], spec/permissions.yaml#order.cancel, #notification.read, `docs/specs/M15-01-customer-care-role.md` (AC-EMP-019, `MANAGER_BUNDLE`), `docs/product/OPEN_QUESTIONS.md` Q183–Q185

## 1. Mục tiêu
- Q183: đơn "Chờ điều phối" mà mọi đầu việc đã bị huỷ vẫn huỷ được — Manager, hoặc Sale/CSKH là người tạo đơn.
- Q184: CSKH tạo đơn thì nhận (đọc được) thông báo về đơn đó như Sale.
- Q185: Manager luôn kèm Sale + CSKH + QLKT — bổ sung cho tài khoản Manager đang thiếu (vd Nam).

## 2. Phạm vi
- Trong phạm vi:
  - guard mới `order_has_no_live_tasks` (đếm đầu việc **chưa huỷ**) thay cho `order_has_no_tasks` ở lệnh `cancel`; `recall` giữ nguyên `order_has_no_tasks`;
  - `order.cancel` thêm `CUSTOMER_CARE: own`;
  - `notification.read` thêm `CUSTOMER_CARE: self`;
  - migration dữ liệu: mọi nhân viên có `MANAGER` được bổ sung vai trò còn thiếu trong `MANAGER_BUNDLE`.
- Ngoài phạm vi: đơn còn đầu việc **chưa huỷ** (vd "Cần giao lại") vẫn không huỷ bằng `cancel` — QLKT huỷ đầu việc trước; CSKH gửi đơn (`order.submit`) không đổi.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-269 | Đơn `PENDING_DISPATCH` của Sale Hoa, có 1 đầu việc đã `CANCELLED` (không còn đầu việc khác) | Hoa `POST /orders/{id}/cancel` `{version, reason}` | 200; đơn `CANCELLED`; 1 audit `cancel` | integration |
| AC-ORD-270 | Như trên | Manager huỷ | 200; đơn `CANCELLED` | integration |
| AC-ORD-271 | Đơn `PENDING_DISPATCH` có 1 đầu việc `NEEDS_ASSIGNEE` (chưa huỷ) | Hoa huỷ | 409 `GUARD_FAILED` guard=`order_has_no_live_tasks`, "Đơn đang có đầu việc, không thể thực hiện thao tác này." | integration |
| AC-ORD-272 | Đơn `PENDING_DISPATCH` có đầu việc đã huỷ | Hoa `POST /orders/{id}/recall` | 409 guard=`order_has_no_tasks` (thu hồi không đổi) | integration |
| AC-ORD-273 | Đơn `DRAFT`/`PENDING_DISPATCH` do CSKH Lan tạo | Lan huỷ | 200; `allowed_commands` của Lan có `cancel` | integration |
| AC-ORD-274 | Đơn do Sale Hoa tạo | CSKH Lan huỷ | 403/404 (không phải đơn của Lan); `allowed_commands` của Lan không có `cancel` | integration |
| AC-NTF-053 | CSKH Lan tạo đơn; đơn được gửi và giao việc | Lan `GET /notifications` | 200; có thông báo "Đơn hàng đã bắt đầu thực hiện" của đơn đó; `/auth/me` của Lan có capability `notification.read` | integration |
| AC-EMP-126 | Manager mở Nhân sự › "Cách phân quyền hoạt động" | xem "Nguyên tắc" | Có câu "Người tạo đơn (Nhân viên kinh doanh hoặc Chăm sóc khách hàng) được huỷ đơn của mình khi đơn chưa điều phối hoặc mọi đầu việc đã huỷ, và nhận thông báo về đơn đó." | component |
| AC-EMP-125 | DB có Manager chỉ có vai trò `MANAGER` (và 1 Manager đã đủ bộ) | chạy migration lên head | Cả hai có đúng `MANAGER, SALE, CUSTOMER_CARE, TECH_LEAD`; nhân viên không phải Manager không đổi | integration (migration) |

## 4. API
Không thêm endpoint. Thay đổi quyền/guard như mục 2 (`make contract` sinh lại `menu.json`, `permissionMatrix.json`).

## 5. Dữ liệu / Migration
Migration dữ liệu `backfill_manager_bundle_roles`: `INSERT INTO employee_roles` các vai trò còn thiếu cho mọi `employee_id` có `MANAGER`. Downgrade: không làm gì (không biết vai trò nào được thêm bởi migration).

## 6. UI
Không đổi code: nút "Huỷ đơn" và chuông thông báo đã hiện theo `allowed_commands` / capability do server trả. Trang Nhân sự › "Cách phân quyền hoạt động" và `PERMISSIONS.md` cập nhật câu chữ.

## 7. Kịch bản UAT thủ công
1. Hồng tạo + gửi đơn; Toàn tạo đầu việc rồi huỷ đầu việc → đơn "Chờ điều phối"; Hồng bấm "Huỷ đơn" → "Đã huỷ".
2. Lan tạo đơn nháp → thấy "Huỷ đơn" và huỷ được; Lan không huỷ được đơn của Hồng.
3. Lan có chuông thông báo; sau khi đơn của Lan được giao việc, Lan nhận "Đơn hàng đã bắt đầu thực hiện".
4. Nam (Manager) có menu Điều phối kỹ thuật (QLKT) và nhận thông báo như QLKT.

## 8. Giả định & câu hỏi
- Giả định: migration bổ sung vai trò không ghi audit từng nhân viên (dữ liệu cũ trước M15-01), ghi chú trong migration.
