# M16-09 — Danh sách đơn: bố cục dòng bộ lọc (tìm kiếm / từ ngày / đến ngày) theo breakpoint

- **Status:** Approved (2026-10-24, chủ dự án chốt trực tiếp trong phiên)
- **Backlog:** M16-09 · **Milestone:** M16
- **Liên quan:** `docs/specs/M3-03b-order-list-detail-ui.md` (ô "Tìm kiếm"), `docs/specs/M15-02b-...` (ô "Từ ngày"/"Đến ngày", chỉ hiện với CSKH). Thuần UI — không đổi API/DB/quyền.

## 1. Mục tiêu
Là người dùng màn "Danh sách đơn" trên máy tính (laptop), tôi muốn ô "Tìm kiếm", "Từ ngày", "Đến ngày" nằm cùng 1 dòng để đỡ chiếm chiều cao màn hình; trên tablet/điện thoại, "Tìm kiếm" vẫn nằm riêng 1 dòng (đủ rộng để nhập), "Từ ngày"/"Đến ngày" xếp cùng 1 dòng ngay dưới.

## 2. Phạm vi
- Trong phạm vi — `frontend/src/features/orders/pages/OrdersListPage.tsx`, khối chứa 3 ô lọc (gộp 2 `<div>` lưới hiện có — 1 chứa "Tìm kiếm", 1 chứa "Từ ngày"/"Đến ngày" khi là CSKH — thành 1 lưới chung):
  - **Laptop (`lg:`, ≥1024px)**: "Tìm kiếm" + "Từ ngày" + "Đến ngày" cùng 1 dòng.
  - **Tablet/điện thoại (< `lg:`)**: "Tìm kiếm" chiếm nguyên 1 dòng; "Từ ngày" + "Đến ngày" cùng 1 dòng tiếp theo.
  - "Từ ngày"/"Đến ngày" vẫn chỉ hiện với vai trò CSKH như hiện tại (`isCustomerCare`) — không đổi điều kiện hiện/ẩn, chỉ đổi cách xếp khi chúng có hiện.
  - Khi không có "Từ ngày"/"Đến ngày" (không phải CSKH): "Tìm kiếm" vẫn đúng 1 dòng ở mọi breakpoint (không bị kéo giãn hết chiều ngang ở laptop — giữ đúng tỷ lệ nửa dòng như hành vi hiện có).
- Ngoài phạm vi: đổi điều kiện hiện/ẩn "Từ ngày"/"Đến ngày"; đổi copy, debounce, hành vi lọc; đổi bố cục nhóm chip trạng thái/checkbox "của tôi" nằm ngay dưới (giữ nguyên).

## 3. Acceptance Criteria
> Thuần UI, không đổi API/quyền — không có AC 403/404/409/422.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-043 | An/Tuấn/Hoa (không phải CSKH) mở "Danh sách đơn", laptop 1440px | render | Chỉ có ô "Tìm kiếm" (không có "Từ ngày"/"Đến ngày"), nằm 1 mình trên dòng đầu, không chiếm hết chiều ngang (giữ đúng tỷ lệ nửa dòng như trước) | component |
| AC-UI-044 | Lan (CUSTOMER_CARE) mở "Danh sách đơn", laptop 1440px | render | "Tìm kiếm", "Từ ngày", "Đến ngày" cùng nằm trên 1 dòng (cùng 1 `top` của bounding box) | component |
| AC-UI-045 | Lan (CUSTOMER_CARE) mở "Danh sách đơn", tablet/mobile 390px | render | "Tìm kiếm" nằm riêng 1 dòng (full width lưới); "Từ ngày" và "Đến ngày" nằm cùng 1 dòng ngay dưới (cùng `top`, khác `top` của "Tìm kiếm") | component |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Gộp 2 lưới hiện có (`grid gap-3 sm:grid-cols-2` cho "Tìm kiếm", `grid gap-3 sm:grid-cols-2` cho "Từ ngày"/"Đến ngày") thành 1 lưới: `grid grid-cols-2 gap-3 lg:grid-cols-4`.
  - "Tìm kiếm" bọc trong `<div className="col-span-2">` (chiếm 2/2 cột ở tablet/mobile = nguyên dòng; 2/4 cột ở laptop = nửa dòng).
  - "Từ ngày"/"Đến ngày" (khi CSKH) mỗi ô chiếm 1 cột mặc định: ở tablet/mobile (lưới 2 cột) nằm cùng 1 dòng ngay dưới "Tìm kiếm"; ở laptop (lưới 4 cột) nằm cùng dòng với "Tìm kiếm" (2+1+1 = 4 cột, đúng 1 dòng).
- Không đổi component `TextField`, không đổi logic state/debounce.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Sale/Manager/QLKT (không phải CSKH) → mở "Danh sách đơn" ở 1440px và 390px → chỉ thấy ô "Tìm kiếm", không vỡ layout.
2. Đăng nhập CSKH → mở ở 1440px → "Tìm kiếm"/"Từ ngày"/"Đến ngày" cùng 1 dòng.
3. Đăng nhập CSKH → mở ở 390px → "Tìm kiếm" 1 dòng, "Từ ngày"+"Đến ngày" dòng tiếp theo.

## 8. Giả định & câu hỏi
- Không có câu hỏi mới — yêu cầu chỉ đổi bố cục CSS, không đổi quy tắc nghiệp vụ nào (điều kiện hiện "Từ ngày"/"Đến ngày" theo vai trò CSKH giữ nguyên như đã chốt ở spec M15-02b).
