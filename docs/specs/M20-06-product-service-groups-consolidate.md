# M20-06 — Dữ liệu: gộp "Nhóm sản phẩm/dịch vụ" về 3 nhóm chuẩn

- **Status:** Approved (2026-11-01 — chủ dự án duyệt; Q134, Q135 theo mặc định)
- **Backlog:** M20-06 · **Milestone:** M20
- **Liên quan:** `docs/specs/M16-07-product-service-groups.md` (bảng `product_service_groups`, 3 UUID seed cố định), `docs/specs/M16-08-order-division-group.md` (`orders.division_id` — "Phòng phụ trách"), migration mẫu `20261024_0517_order_division_group.py`

## 1. Mục tiêu
Là Manager, tôi muốn danh sách "Nhóm sản phẩm/dịch vụ" chỉ còn đúng 3 nhóm "Kỹ thuật chung", "Thiết bị an ninh", "Thiết bị văn phòng", để "Phòng phụ trách" trên đơn được chọn thống nhất; dữ liệu đang nằm ở nhóm khác được gộp vào "Kỹ thuật chung" và người dùng tự phân lại trên giao diện.

## 2. Phạm vi
**Thực tế code hiện tại:** Sản phẩm/Dịch vụ **chưa** gắn với nhóm nào (M16-07 cố ý để ngoài phạm vi). Nơi duy nhất dùng nhóm là `orders.division_id` ("Phòng phụ trách" trên đơn). Spec này hiểu "SP/DV đang có" là **các đơn đang trỏ tới nhóm cũ** — xem Q134.

- Trong phạm vi (chỉ 1 Alembic migration dữ liệu mới, không đổi API/UI):
  1. Đặt lại 3 nhóm chuẩn theo **UUID cố định** của M16-07 (`a1111111-…` Thiết bị văn phòng, `a2222222-…` Thiết bị an ninh, `a3333333-…` Kỹ thuật chung): `name` đúng chính tả chuẩn, `is_active=true` (kể cả khi trước đó bị đổi tên hoặc ngừng hoạt động).
  2. Mọi đơn có `division_id` trỏ tới nhóm **không thuộc** 3 UUID trên → đổi thành "Kỹ thuật chung". Đơn ở mọi trạng thái (kể cả COMPLETED/CANCELLED). Đơn đang thuộc 3 nhóm chuẩn hoặc `division_id = NULL` giữ nguyên.
  3. Mọi nhóm không thuộc 3 UUID chuẩn → `is_active=false` (ngừng, **không xoá cứng** — giữ đúng quy ước M16-07, tránh lỗi khoá ngoại).
  4. `version` của nhóm/đơn bị đổi tăng 1 (để tab đang mở nhận `STALE_VERSION` thay vì ghi đè âm thầm).
  5. Downgrade: no-op dữ liệu (không khôi phục được mapping cũ — ghi rõ trong docstring migration).
- Ngoài phạm vi: gắn nhóm vào Sản phẩm/Dịch vụ (Q134); chặn tạo nhóm mới (Q135 — mặc định vẫn cho Thêm như M20-07); ghi `audit_events` cho thay đổi dữ liệu do migration (không phải chuyển trạng thái); M20-07 (phòng ban).
- Người dùng "tự phân lại trên UI": dùng sẵn ô "Nhóm sản phẩm/dịch vụ" ở form đơn **Nháp** (M16-08) — không cần màn mới. Đơn đã gửi không sửa được nhóm (API hiện tại chỉ cho sửa đơn Nháp) → giữ "Kỹ thuật chung"; cần sửa nhóm sau khi gửi thì làm item mới (Q136, chốt 2026-11-01).

## 3. Acceptance Criteria

Dữ liệu chung cho AC-CAT-100…104 (trạng thái DB ngay trước khi chạy migration M20-06):
- Nhóm chuẩn: "Thiết bị văn phòng" (active), "Thiết bị an ninh" (đã bị đổi tên thành "Camera - An ninh", active), "Kỹ thuật chung" (đã bị ngừng hoạt động).
- Nhóm người dùng tự thêm: "Thiết bị mạng" (active), "Máy in cũ" (đã ngừng).
- Đơn: DH2610-0101 → "Thiết bị mạng" (IN_PROGRESS, version 3); DH2610-0102 → "Máy in cũ" (COMPLETED); DH2610-0103 → "Thiết bị văn phòng"; DH2610-0104 → `division_id = NULL`; DH2610-0105 → "Thiết bị mạng" (DRAFT, version 3).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-100 | Dữ liệu chung ở trên | `alembic upgrade` tới revision M20-06 | `GET /api/v1/product-service-groups?is_active=true` trả **đúng 3** nhóm, tên chính xác "Kỹ thuật chung", "Thiết bị an ninh", "Thiết bị văn phòng", mỗi nhóm đúng UUID cố định của M16-07 | integration (migration) |
| AC-CAT-101 | Như trên | upgrade | "Thiết bị mạng" và "Máy in cũ" vẫn tồn tại (không xoá cứng), `is_active=false`; "Thiết bị mạng" `version` tăng 1 | integration (migration) |
| AC-CAT-102 | Như trên | upgrade | DH2610-0101 và DH2610-0102 có `division_id` = UUID "Kỹ thuật chung"; DH2610-0101 `version` 3 → 4; các trường khác của đơn (trạng thái, dòng hàng, tổng tiền) không đổi | integration (migration) |
| AC-CAT-103 | Như trên | upgrade | DH2610-0103 vẫn "Thiết bị văn phòng", DH2610-0104 vẫn `NULL`, `version` của 2 đơn này không đổi | integration (migration) |
| AC-CAT-104 | Như trên | upgrade | Không phát sinh dòng `audit_events` mới; chạy lại migration trên DB đã đúng 3 nhóm (không có nhóm lạ) → không đổi gì, không lỗi (idempotent về dữ liệu) | integration (migration) |
| AC-CAT-105 | Sau migration; An (MANAGER) đang mở đơn nháp DH2610-0105 từ trước khi migrate (giữ `version` 3) — Q136: chỉ đơn Nháp sửa được nhóm | `PATCH /api/v1/orders/{id}` `{division_id: <Thiết bị an ninh>, version: 3}` | 409 `STALE_VERSION`; tải lại rồi gửi với `version` 4 → 200, "Phòng phụ trách" = "Thiết bị an ninh" | integration |
| AC-CAT-106 | Sau migration; Hoa (SALE) mở form tạo đơn, desktop 1440px và mobile 390px | mở ô chọn "Phòng phụ trách" | Chỉ thấy 3 lựa chọn "Kỹ thuật chung", "Thiết bị an ninh", "Thiết bị văn phòng" (không thấy "Thiết bị mạng") | e2e |
| AC-CAT-107 | Sau migration; An (MANAGER) mở "Danh mục" → "Nhóm sản phẩm/dịch vụ", lọc "Đang hoạt động" | render | Thấy đúng 3 nhóm chuẩn; lọc "Ngừng hoạt động" thấy "Thiết bị mạng", "Máy in cũ" | e2e |

Không có AC phân quyền/403 mới: migration không thêm endpoint; quyền trên nhóm và đơn giữ nguyên `catalog.manage`/`order.*` (đã có test từ M16-07/M16-08).

## 4. API
Không đổi.

## 5. Dữ liệu / Migration
- 1 migration dữ liệu mới `make migration name=consolidate_product_service_groups` (không sửa migration cũ). Thứ tự trong `upgrade()` để không vi phạm unique index `lower(btrim(name)) WHERE is_active`:
  1. `UPDATE orders SET division_id = '<GENERAL>', version = version + 1, updated_at = now() WHERE division_id IS NOT NULL AND division_id NOT IN (<3 UUID>)`
  2. `UPDATE product_service_groups SET is_active = false, version = version + 1, updated_at = now() WHERE id NOT IN (<3 UUID>) AND is_active`
  3. Với từng UUID chuẩn: `UPDATE … SET name = '<tên chuẩn>', is_active = true, version = version + 1 WHERE id = … AND (name <> '<tên chuẩn>' OR NOT is_active)`; nếu dòng không tồn tại (DB lạ) → `INSERT` với UUID cố định.
- Không đổi schema; không cột/index mới.
- Seed e2e (`backend/scripts/seed_e2e.py`) nếu đang tạo nhóm ngoài 3 nhóm chuẩn ở trạng thái active → sửa cho khớp.

## 6. UI
Không đổi code. Hệ quả nhìn thấy: ô "Phòng phụ trách" (form tạo/sửa đơn) chỉ còn 3 lựa chọn; trang "Nhóm sản phẩm/dịch vụ" chỉ còn 3 nhóm đang hoạt động.

## 7. Kịch bản UAT thủ công
1. Trước khi nâng cấp: ghi lại vài đơn đang có "Phòng phụ trách" là nhóm tự thêm (nếu có).
2. Nâng cấp (deploy) → "Danh mục" → "Nhóm sản phẩm/dịch vụ": chỉ còn 3 nhóm đang hoạt động; nhóm khác nằm ở bộ lọc "Ngừng hoạt động".
3. Mở các đơn ở bước 1: "Nhóm sản phẩm/dịch vụ" = "Kỹ thuật chung"; với đơn Nháp → sửa lại thành nhóm đúng → lưu thành công (đơn đã gửi chỉ xem, không sửa — Q136).
4. Tạo đơn mới: ô "Phòng phụ trách" chỉ có 3 lựa chọn.

## 8. Giả định & câu hỏi
- **Q134 (cần quyết):** Backlog ghi "gộp mọi **SP/DV** đang có vào Kỹ thuật chung … người dùng tự phân lại trên UI", nhưng hiện Sản phẩm/Dịch vụ **không có trường Nhóm** — nhóm chỉ dùng cho "Phòng phụ trách" trên đơn. Mặc định của spec: chỉ gộp **đơn** đang trỏ tới nhóm ngoài 3 nhóm chuẩn; đơn đang ở "Thiết bị văn phòng"/"Thiết bị an ninh" giữ nguyên (không dồn hết về "Kỹ thuật chung" để khỏi mất phân loại đúng). Nếu anh/chị muốn thêm trường "Nhóm" cho từng Sản phẩm/Dịch vụ (mặc định "Kỹ thuật chung", sửa trên form SP/DV) → tách thành item mới **M20-06b** (backend + import CSV + UI SP/DV, >400 dòng).
- **Q135 (cần quyết):** "Chỉ còn 3 nhóm" — có chặn nút "Thêm nhóm" luôn không? Mặc định: **vẫn cho Thêm** (giống quyết định M20-07 cho phòng ban); migration chỉ dọn dữ liệu một lần.
- Giả định: đơn đã COMPLETED/CANCELLED cũng được đổi "Phòng phụ trách" về "Kỹ thuật chung" (đúng chữ "gộp mọi"); không ghi `audit_events` vì đây là sửa dữ liệu, không phải chuyển trạng thái (quy tắc 8 chỉ áp chuyển trạng thái).
- Giả định: "nhóm cũ ngừng/xoá" → chọn **ngừng hoạt động**, không xoá cứng (M16-07 chỉ có ngừng; xoá cứng vỡ khoá ngoại nếu còn tham chiếu lịch sử).
- Không cần đổi `spec/*.yaml`.
