# M27-01a — API: CSKH ghi nhận cuộc gọi chăm sóc khách hàng

- **Status:** Approved (2026-11-08; Q189–Q192 đã chốt)
- **Backlog:** M27-01a · **Milestone:** M27
- **Phụ thuộc:** M21-05a (`customer_potential_notes`), M15-01 (vai trò CUSTOMER_CARE)
- **Liên quan:** spec/permissions.yaml (2 capability mới), `docs/specs/M21-05a-customer-potential-api.md`, báo cáo "Doanh thu theo khách hàng" (cột Tiềm năng)

## 1. Mục tiêu
Là nhân viên CSKH, tôi muốn ghi lại mỗi cuộc gọi chăm sóc khách hàng tiềm năng — đã chào sản phẩm/dịch vụ gì và khách yêu cầu gì — để Quản lý theo dõi được công việc chăm sóc, và yêu cầu của khách trở thành "Tiềm năng sử dụng dịch vụ" của khách đó.

## 2. Phạm vi
- Trong phạm vi:
  - Bảng mới `customer_care_calls` (append-only): `customer_id`, `caller_id` (người ghi), `offered` (Chào sản phẩm/dịch vụ gì — **gõ tự do**, bắt buộc, 1–2000 ký tự), `customer_request` (Ghi nhận yêu cầu của KH — tuỳ chọn, ≤ 2000 ký tự), `called_at` = thời điểm lưu.
  - `POST /customer-care-calls` `{ customer_id, offered, customer_request? }` → 201. Ghi `audit_events` (`entity_type=CUSTOMER`, `action=care_call`, `data.care_call_id`).
  - Có `customer_request` → **cùng giao dịch** thêm 1 bản ghi `customer_potential_notes` (`note` = yêu cầu, `author` = người gọi, `order_id = NULL`, `care_call_id` = cuộc gọi) → thành "tiềm năng hiện tại" của khách (Q192, dùng chung với ghi chú của KTV).
  - `GET /customer-care-calls?customer_id&caller_id&from&to&q&limit&offset` — mới nhất trước; `q` tìm theo tên/SĐT khách; `from`/`to` theo ngày gọi (giờ VN). Mỗi dòng: khách (id, tên, SĐT), người gọi (id, tên), `offered`, `customer_request`, `called_at`.
  - Capability mới: `customer_care.call.record: { CUSTOMER_CARE: all }` (Q189: chỉ CSKH ghi; Manager luôn kèm CSKH nên cũng ghi được) và `customer_care.call.read: { MANAGER: all, CUSTOMER_CARE: own }` (Q191: Quản lý xem tất cả, CSKH xem cuộc gọi do mình ghi).
  - `customer_potential_notes.order_id` thành nullable + cột mới `care_call_id` (FK nullable), ràng buộc đúng 1 trong 2 khác NULL. `GET /orders/{id}/customer-potential` trả cả ghi chú từ cuộc gọi (`order_id`/`order_code = null`, `source = "CARE_CALL"`; ghi chú KTV `source = "ORDER"`).
- Ngoài phạm vi: UI (M27-01b); sửa/xoá cuộc gọi đã ghi; ghi lùi ngày gọi; chọn SP/DV từ danh mục (Q190: gõ tự do); nhắc lịch gọi lại.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CUS-061 | Lan (CUSTOMER_CARE), KH "Công ty TNHH Minh Phát" | Lan `POST /customer-care-calls {customer_id, offered:"Camera IP 4MP", customer_request:"Báo giá 6 camera kho"}` | 201; `caller=Lan`, `called_at` ≈ now; 1 audit `care_call` trên CUSTOMER; ~~1 `customer_potential_notes`~~ (UAT-05 AC-CUS-086, Q199: không ghi tiềm năng, yêu cầu chỉ lưu ở cuộc gọi) | integration |
| AC-CUS-062 | Như trên, không có `customer_request` (hoặc chỉ khoảng trắng) | POST | 201; **không** thêm ghi chú tiềm năng | integration |
| AC-CUS-063 | `offered` rỗng/khoảng trắng hoặc > 2000 ký tự; `customer_request` > 2000; `customer_id` không tồn tại | POST | 422 `VALIDATION_ERROR` (field tương ứng) / 404 khách hàng | integration |
| AC-CUS-064 | Hoa (SALE), Toàn (TECH_LEAD), Quân (TECHNICIAN) | POST | 403 | integration |
| AC-CUS-065 | Lan ghi 2 cuộc, Mai (CSKH khác) ghi 1 cuộc | Lan / Mai / Nam (Manager) `GET /customer-care-calls` | Lan thấy 2 (của mình), Mai thấy 1, Nam thấy 3; mới nhất trước; Hoa (SALE) → 403 | integration |
| AC-CUS-066 | 3 cuộc gọi ở 2 khách, 2 ngày khác nhau | Nam GET lọc `customer_id`, `caller_id`, `from/to` (ngày giờ VN), `q` (tên/SĐT khách) | Mỗi bộ lọc trả đúng tập; `total` đúng; phân trang `limit/offset` | integration |
| ~~AC-CUS-067~~ (→ UAT-05 AC-CUS-087: tiềm năng chỉ từ KTV, Q199) | KH Minh Phát có ghi chú KTV (đơn DH2611-0005) rồi Lan ghi cuộc gọi có yêu cầu | `GET /reports/revenue-by-customer` | Cột tiềm năng của Minh Phát = yêu cầu từ cuộc gọi (mới nhất) | integration |
| ~~AC-CUS-068~~ (→ UAT-05 AC-CUS-087: tiềm năng chỉ từ KTV, Q199) | Như trên | `GET /orders/{DH2611-0005}/customer-potential` | 2 dòng, mới nhất trước: dòng cuộc gọi `source=CARE_CALL`, `order_code=null`, tác giả Lan; dòng KTV `source=ORDER`, `order_code="DH2611-0005"` | integration |
| AC-CUS-069 | DB có ghi chú tiềm năng cũ (đều có `order_id`) | migration upgrade → downgrade → upgrade | Dữ liệu cũ giữ nguyên; downgrade xoá ghi chú từ cuộc gọi rồi khôi phục `order_id NOT NULL` | integration (migration) |
| AC-EMP-127 | Manager mở Nhân sự › "Cách phân quyền hoạt động" | xem ma trận/nguyên tắc | Có 2 quyền "Ghi nhận cuộc gọi chăm sóc KH" (CSKH) và "Xem cuộc gọi chăm sóc KH" (Quản lý: tất cả; CSKH: của mình); câu nguyên tắc "Nhân viên CSKH ghi nhận cuộc gọi chăm sóc khách hàng; yêu cầu của khách trở thành tiềm năng sử dụng dịch vụ của khách." | component |

## 4. API
- `POST /api/v1/customer-care-calls` — body `CareCallCreate {customer_id: uuid, offered: str, customer_request: str | null}` → 201 `CareCallOut`; 403/404/422.
- `GET /api/v1/customer-care-calls` — query như §2, `limit` ≤ 100 (mặc định 20) → `{items: CareCallOut[], total}`.
- `CareCallOut {id, customer_id, customer_name, customer_phone, caller_id, caller_name, offered, customer_request, called_at}`.
- `CustomerPotentialNoteOut` thêm `source: "ORDER" | "CARE_CALL"`; `order_id`, `order_code` thành nullable.
- `make contract` sinh lại OpenAPI, TS types, `menu.json`, `permissionMatrix.json`.

## 5. Dữ liệu / Migration
- Tạo `customer_care_calls` (`id uuid pk`, `customer_id fk customers RESTRICT`, `caller_id fk employees RESTRICT`, `offered text check 1..2000`, `customer_request text null check ≤2000`, `called_at timestamptz default now()`; index `(caller_id, called_at desc)`, `(customer_id, called_at desc)`).
- `customer_potential_notes`: `order_id` → nullable; thêm `care_call_id uuid null fk customer_care_calls RESTRICT`; check `num_nonnulls(order_id, care_call_id) = 1`.

## 6. UI
Không (M27-01b).

## 7. Kịch bản UAT thủ công
Kiểm ở M27-01b.

## 8. Giả định & câu hỏi
- Q189–Q192 chốt 2026-11-08 (xem `OPEN_QUESTIONS.md`).
- Giả định: không sửa/xoá cuộc gọi (append-only như ghi chú tiềm năng); thời điểm gọi = lúc lưu; mọi khách hàng trong hệ thống đều gọi được (không giới hạn "khách tiềm năng").
- Giả định (khi implement): ràng buộc DB `customer_potential_notes.note` nới 1000 → 2000 ký tự để chứa yêu cầu cuộc gọi (≤ 2000); API ghi chú của KTV vẫn giới hạn 1000. Downgrade khôi phục 1000 (ghi chú từ cuộc gọi đã bị xoá).
