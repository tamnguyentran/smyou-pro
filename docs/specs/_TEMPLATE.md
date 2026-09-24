# <ID> — <Tên tính năng>

- **Status:** Draft | Approved | Done
- **Backlog:** <ID> · **Milestone:** <M?>
- **Liên quan:** spec/state_machines.yaml#<máy>, spec/permissions.yaml#<capability>, DOMAIN_MODEL §<n>

## 1. Mục tiêu (1–3 câu, ngôn ngữ người dùng)
Là <vai trò>, tôi muốn <hành động> để <giá trị>.

## 2. Phạm vi
- Trong phạm vi: …
- Ngoài phạm vi (không làm ở item này): …

## 3. Acceptance Criteria
> Mỗi AC phải kiểm chứng được bằng máy. Viết cả trường hợp **bị cấm**. ID không bao giờ đổi/tái sử dụng; bỏ AC thì gạch ngang và ghi lý do.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-XXX-001 | Sale A đã đăng nhập; đơn DH2609-0001 ở DRAFT do A tạo, có 1 dòng | A bấm "Gửi đơn" | API 200; đơn → PENDING_DISPATCH; 1 audit event; QLKT nhận 1 thông báo; UI hiện toast "Đã gửi đơn…" | integration + e2e |
| AC-XXX-002 | Sale B (không phải người tạo) | gọi `POST /orders/{id}/submit` | 404 (ngoài scope) | integration |
| AC-XXX-003 | Đơn DRAFT không có dòng và mô tả trống | gửi | 409 `GUARD_FAILED` guard=`has_lines_or_description`; UI hiện lỗi tiếng Việt | integration + component |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/orders/{id}/submit | order.submit | `{ version }` | `OrderDetail` | 404, 409 |

## 5. Dữ liệu / Migration
Bảng/cột mới, index, ràng buộc. "Không có" nếu không đổi.

## 6. UI
- Màn hình / component, vị trí nút, trạng thái loading/empty/error, khác biệt mobile vs desktop.
- Copy tiếng Việt chính xác cho nút, toast, lỗi.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. …

## 8. Giả định & câu hỏi
- Giả định: … (tham chiếu Q## trong OPEN_QUESTIONS nếu có)
- Câu hỏi mới: …
