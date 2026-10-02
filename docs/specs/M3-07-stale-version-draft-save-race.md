# M3-07 — Sửa lỗi `STALE_VERSION` oan khi lưu nháp (race ghi đè cache `GET /orders/{id}`)

- **Status:** Approved
- **Backlog:** M3-07 · **Milestone:** M3
- **Liên quan:** `docs/specs/M3-02b-draft-orders-ui.md` (AC-ORD-034, AC-ORD-035), `docs/specs/M3-04b-order-post-submit-edits-ui.md`, `docs/specs/M4-01b-dispatch-task-create-ui.md` (consumer thứ hai của `useOrder`), spec/permissions.yaml#order.update (không đổi)

## 1. Mục tiêu
Là Kinh doanh đang tạo đơn, tôi muốn "Lưu nháp" không bao giờ báo "Thông tin đã bị người khác thay đổi" khi **không có ai khác** sửa đơn, để tôi không mất thời gian tải lại và nhập lại.

## 2. Phạm vi
- Trong phạm vi (chỉ frontend):
  - Bất biến mới cho cache react-query khoá `[ORDER_KEY, id]`: **bản chụp đơn trong cache không bao giờ lùi `version`**. Một phản hồi `GET /api/v1/orders/{id}` bay song song, trả về `version` nhỏ hơn bản đang có trong cache, bị **bỏ qua** (giữ nguyên bản mới hơn).
  - Áp bất biến ở đúng 2 chỗ ghi cache đơn trong `frontend/src/features/orders/api.ts`: `queryFn` của `useOrder` và `useSetOrder` (chỗ mọi mutation ghi phản hồi vào cache).
  - Bỏ `test.describe.configure({ mode: "default" })` trong `frontend/e2e/dispatch.spec.ts` (+ khối chú thích tạm) để file chạy song song như `fullyParallel` mặc định.
- Ngoài phạm vi:
  - Backend: không đổi endpoint, không đổi cách sinh `version`, không migration.
  - Quyền: không đổi `spec/permissions.yaml` / `spec/state_machines.yaml`.
  - Cache của `GET /orders` (danh sách) và `GET /orders/{id}/history` — không dùng `version` để ghi, không có race này.
  - Hàng đợi ghi (`writeQueue.ts`) giữ nguyên: nó đã chống race **giữa các lệnh ghi**; item này chống race **giữa một lệnh ghi và một lệnh đọc**.
  - Không thêm `staleTime`/`refetchOnMount` cho `useOrder` (xem §8).

## 3. Acceptance Criteria

Dữ liệu mẫu (như M3-02b §): **Hoa** NV005 [SALE]; khách `KH00001` "Cty Sáng Tạo Mới" SĐT `0909123456`; sản phẩm `LCD-DELL22` "Màn hình Dell 22 inch" giá 2.500.000, VAT 8%, giá cố định. Đơn được tạo trong các AC dưới đây có mã `DH2610-0042`.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-ORD-118 | Hàm thuần mới (ví dụ `freshestOrder(cached, incoming)`) dùng cho cả `useOrder` và `useSetOrder` | gọi với 4 trường hợp: `cached.version = 2 / incoming.version = 1`; `2 / 3`; `2 / 2`; `cached = undefined / incoming.version = 1` | trả về `cached` ở trường hợp 1 (bỏ qua bản cũ); trả về `incoming` ở cả 3 trường hợp còn lại (lớn hơn, bằng, chưa có cache) — không đột biến tham số đầu vào | unit |
| AC-ORD-119 | Hoa ở `/orders/new`, đã chọn `KH00001`; backend chậm: `POST /orders` trả đơn `DH2610-0042` `version = 1`, `POST /orders/{id}/lines` trả `version = 2` **trước khi** `GET /orders/{id}` (bay song song do `useOrder` được bật khi có `id`) trả về bản chụp `version = 1` | Hoa bấm "Thêm dòng hàng" → chọn `LCD-DELL22`; đợi phản hồi `GET` cũ về; bấm "Lưu nháp" | `PATCH /orders/DH2610-0042` gửi `version: 2` (không phải `1`) → 200; toast "Đã lưu nháp DH2610-0042."; **không** hiện banner đỏ "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." | component |
| AC-ORD-120 | Cùng bối cảnh AC-ORD-119, ngay sau khi phản hồi `GET` `version = 1` (không chứa dòng hàng nào) về | Hoa xem khu vực "Dòng hàng" và tổng tiền | dòng "Màn hình Dell 22 inch" vẫn hiện (không biến mất rồi hiện lại); tổng tiền vẫn là 2.700.000 ₫ (2.500.000 + VAT 8%); không có vòng loading thứ hai ở bảng dòng hàng | component |
| AC-ORD-121 | Hoa mở `/orders/DH2610-0042`, cache đang giữ `version = 2`; có người khác (QLKT) thực sự sửa đơn → `GET /orders/{id}` (refetch khi quay lại trang) trả `version = 5`, `service_address` đổi thành "Số 7 Nguyễn Huệ, Q.1" | phản hồi `GET` về | UI hiện dữ liệu mới (`version = 5`, địa chỉ mới) — bất biến chỉ chặn bản **cũ hơn**, không chặn bản mới hơn; bấm "Lưu nháp" sau đó gửi `version: 5` → 200 | component |
| AC-ORD-122 | Hoa bấm "Lưu nháp", backend trả 409 `STALE_VERSION` thật (người khác vừa lưu, server đang ở `version = 7`) | xem UI rồi bấm "Tải lại" trong banner | giữ đúng hành vi AC-ORD-035: banner đỏ "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại"; bấm "Tải lại" → `GET /orders/{id}` trả `version = 7` được nhận (không bị bất biến chặn), form reset theo dữ liệu mới, banner mất; lần "Lưu nháp" kế tiếp gửi `version: 7` → 200 | component |
| AC-ORD-123 | Mutation trả phản hồi cũ hơn cache (ví dụ `PATCH` chậm trả `version = 3` sau khi một `POST .../lines` đã ghi `version = 4` vào cache) | phản hồi `PATCH` về `useSetOrder` | cache vẫn giữ `version = 4`; mọi lệnh ghi tiếp theo dùng `version: 4` → không có 409 oan (bất biến áp cả ở `useSetOrder`, không chỉ ở `queryFn` của `useOrder`) | component |
| AC-ORD-124 | `frontend/e2e/dispatch.spec.ts` đã bỏ `test.describe.configure({ mode: "default" })` → 2 test (đều tạo + gửi đơn qua giao diện Kinh doanh) chạy song song theo `fullyParallel` | `make e2e` (project `mobile` + `desktop`) | cả 2 test xanh trên cả 2 project; không test nào gặp banner "Thông tin đã bị người khác thay đổi. Vui lòng tải lại."; file không còn dòng `describe.configure` nào | e2e |

## 4. API
Không có endpoint mới hoặc thay đổi. Các request liên quan (không đổi hợp đồng):

| Method | Path | Capability | Ghi chú cho item này |
|---|---|---|---|
| GET | /api/v1/orders/{id} | order.read | phản hồi có `version` nhỏ hơn bản trong cache bị client bỏ qua |
| PATCH | /api/v1/orders/{id} | order.update | `version` gửi lên luôn là `version` lớn nhất client từng thấy của đơn đó |

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Không có màn hình, nút, chuỗi hiển thị hay token màu mới. Không cần screenshot mới (DoD: mục screenshot không áp dụng — UI không đổi về mặt thị giác).
- Sửa đổi nằm ở tầng dữ liệu của `frontend/src/features/orders/api.ts` (`useOrder`, `useSetOrder`), ảnh hưởng mọi consumer của `useOrder`: `DraftOrderForm` (M3-02b/M3-04b) và `TaskCreateSheet` (M4-01b).
- Bản cũ hơn bị bỏ qua **im lặng**: không toast, không banner, không log cho người dùng (xem §8).
- Ước lượng diff non-test: ~30–40 dòng (hàm thuần + 2 chỗ gọi + chú thích) → **không cần tách** `a`/`b`.

## 7. Kịch bản UAT thủ công
1. Mở DevTools → tab Network → bật throttling "Slow 3G" (để `GET` chậm hơn `POST`).
2. Vào "Đơn hàng" → "Tạo đơn mới", chọn khách "Cty Sáng Tạo Mới".
3. Bấm "Thêm dòng hàng" → chọn "Màn hình Dell 22 inch" → đợi URL đổi thành `/orders/{id}` và bảng dòng hàng hiện dòng vừa thêm.
4. Đợi 2–3 giây cho mọi request trong tab Network xong, kiểm dòng hàng **vẫn còn** trên bảng.
5. Bấm "Lưu nháp" → phải thấy toast "Đã lưu nháp DH26xx-xxxx." và **không** thấy banner đỏ "Thông tin đã bị người khác thay đổi."

## 8. Giả định & câu hỏi
Không có câu hỏi nghiệp vụ mới (không thêm dòng nào vào `OPEN_QUESTIONS.md`); các điểm dưới đây là quyết định kỹ thuật, nêu ra để chủ dự án biết:

- **Giả định 1 — `version` của một đơn tăng đơn điệu ở server.** Mọi lệnh ghi lên đơn (kể cả `task.*`/`assignment.*`, theo Q62) đều tăng `orders.version`; không có đường nào làm nó giảm. Vì vậy "phản hồi có `version` nhỏ hơn" luôn là bản chụp cũ, bỏ qua được an toàn.
- **Giả định 2 — bỏ qua im lặng.** Khi một phản hồi `GET` cũ bị loại, người dùng không được thông báo gì: dữ liệu đang hiển thị vốn đã mới hơn, báo gì cũng chỉ gây hoang mang.
- **Giả định 3 — không thêm `staleTime`/`refetchOnMount: false` cho `useOrder`** (một trong hai hướng sửa ghi ở backlog). Lý do: nó chỉ giảm xác suất chứ không khử gốc race (refetch còn kích hoạt từ "Tải lại", điều hướng, mount lại), và `staleTime > 0` sẽ làm trang chi tiết đơn hiển thị dữ liệu cũ sau khi người khác vừa sửa. Bất biến "cache không lùi `version`" khử gốc race và giữ đúng độ tươi hiện tại. Hệ quả chấp nhận: ngay sau khi `POST /orders` tạo nháp vẫn có **một** `GET /orders/{id}` dư (phản hồi của nó bị bỏ qua nếu đã cũ) — có thể tối ưu sau, không chặn item này.
- **Giả định 4 — AC-ORD-035 không đổi.** 409 `STALE_VERSION` **thật** (người khác sửa) vẫn giữ nguyên banner + nút "Tải lại"; item này chỉ loại trường hợp 409 oan do chính client tự ghi đè cache.
- Không cần sửa `spec/*.yaml`.
