# M16-02a — Báo cáo "Chi phí quà tặng KH" — API

- **Status:** Approved (2026-10-24)
- **Backlog:** M16-02a · **Milestone:** M16
- **Liên quan:** `M16-01a` (`customer_gifts`); `docs/specs/M15-09a-revenue-by-customer-report-api.md` (mẫu báo cáo nhóm theo khách hàng + export CSV, tái dùng cách làm); `spec/permissions.yaml`

## 1. Mục tiêu
Là Manager/Sale/CSKH, tôi muốn xem tổng chi phí quà tặng theo khách hàng trong khoảng thời gian chọn, xem chi tiết từng lần tặng, và xuất file để đối chiếu.

## 2. Phạm vi
- Trong phạm vi:
  - Capability mới `report.customer_gift.read`: `{MANAGER: all, SALE: all, CUSTOMER_CARE: all}` — khớp scope `all` của dữ liệu gốc (Q97, M16-01a), không cần tách `own`.
  - `GET /api/v1/reports/customer-gifts?from=&to=&customer_id=` —
    - `from`/`to` lọc theo `performed_date`; mặc định `from`=đầu tháng hiện tại, `to`=hôm nay (giờ VN) — giống M15-09a.
    - `customer_id`: mặc định "Tất cả".
    - Mỗi dòng là 1 khách hàng: `{customer_code, customer_name, contact_person, gift_count, total_cost (Σ total_amount)}`, sắp theo `customer_code` tăng.
  - `GET /api/v1/reports/customer-gifts/{customer_id}/items?from=&to=` — danh sách bản ghi tặng quà của 1 khách hàng trong khoảng (drilldown), mỗi item đủ trường như `CustomerGiftOut` (M16-01a).
  - `GET /api/v1/reports/customer-gifts/export?from=&to=&customer_id=` — CSV UTF-8 BOM, cùng cột với danh sách nhóm theo khách hàng, mẫu giống `kpi/report/export` + M15-09a (Q100 — CSV BOM đã coi là "xuất excel", không cần `.xlsx`).
- Ngoài phạm vi: UI (M16-02b).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-GFT-030 | `KH00001` có 2 bản ghi trong tháng (tổng 1.500.000), `KH00002` có 1 bản ghi (500.000) | An (MANAGER) `GET /reports/customer-gifts` (không filter) | 200; mặc định đầu tháng→hôm nay; 2 dòng: `KH00001` (`gift_count=2, total_cost=1500000`), `KH00002` (`gift_count=1, total_cost=500000`) — sắp theo `customer_code` | integration |
| AC-GFT-031 | Dữ liệu như trên | `GET ?customer_id=<KH00001>` | Chỉ 1 dòng của `KH00001` | integration |
| AC-GFT-032 | Dữ liệu như trên | Hoa (SALE) `GET /reports/customer-gifts` | 200 — thấy **cả 2 dòng** (scope `all`, không lọc theo người tạo — khác báo cáo doanh thu) | integration |
| AC-GFT-033 | Đức (TECHNICIAN) | `GET /reports/customer-gifts` | 403 | integration |
| AC-GFT-034 | Dữ liệu như AC-GFT-030 | `GET /reports/customer-gifts/<KH00001-id>/items` | 200; 2 bản ghi đủ trường | integration |
| AC-GFT-035 | — | `GET /reports/customer-gifts/export?from=&to=` | 200; `Content-Type: text/csv; charset=utf-8`, BOM đầu file, `Content-Disposition` tên file `chi-phi-qua-tang-kh-{from}_{to}.csv` | integration |

## 4. API
| Method | Path | Capability | Response |
|---|---|---|---|
| GET | /api/v1/reports/customer-gifts | report.customer_gift.read | `{items:[...], total}` |
| GET | /api/v1/reports/customer-gifts/{customer_id}/items | report.customer_gift.read | `[CustomerGiftOut]` |
| GET | /api/v1/reports/customer-gifts/export | report.customer_gift.read | `text/csv` |

## 5. Dữ liệu / Migration
Không — truy vấn tổng hợp từ `customer_gifts`/`customers` (M16-01a) đã có.

## 6. UI
Không có ở item này — xem M16-02b.

## 7. Kịch bản UAT thủ công
1. Gọi báo cáo không filter → thấy đúng tổng hợp theo khách hàng, mặc định đầu tháng→hôm nay.
2. Lọc theo 1 khách hàng → đúng 1 dòng.
3. Drilldown → danh sách đúng bản ghi → export CSV mở Excel đọc đúng dấu.

## 8. Giả định & câu hỏi
- Giả định: không tách `own`/`all` theo role — vì dữ liệu gốc (`customer_gifts`) đã là scope `all` cho mọi role liên quan (Q97), báo cáo phản ánh đúng toàn bộ dữ liệu người dùng đã thấy được, không thu hẹp thêm.
- **Đã chốt (Q100, 2026-10-24):** export CSV UTF-8 BOM, không làm `.xlsx` thật.
