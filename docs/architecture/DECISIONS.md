# Architecture Decision Records

Thêm ADR mới ở cuối khi đưa ra quyết định khó đảo ngược (thư viện mới, thay đổi cấu trúc dữ liệu, bảo mật). Định dạng: Bối cảnh → Quyết định → Hệ quả. Không sửa ADR cũ; ghi ADR mới "Thay thế ADR-00X".

## ADR-001: Modular monolith
Một backend FastAPI, một SPA React, một PostgreSQL. Ranh giới module rõ (domain/service/router) và được import-linter kiểm tra để tách service sau này nếu cần. Lý do: công ty nhỏ, 1 server, cần vận hành đơn giản.

## ADR-002: Máy trạng thái do server quyết định, khai báo bằng dữ liệu
Chuyển trạng thái đơn/task/phân công là lệnh có tên, kiểm tra theo `spec/state_machines.yaml`. Không có API cập nhật `status` tự do. Lý do: toàn vẹn luồng khi nhiều người thao tác; YAML là tài liệu người duyệt được và là đầu vào sinh test tự động.

## ADR-003: Phân quyền theo capability + scope, khai báo bằng dữ liệu
User ↔ nhiều role; role → capability + scope trong `spec/permissions.yaml`. Endpoint kiểm tra capability; truy vấn áp scope. Menu frontend chỉ là hình chiếu. Lý do: một nhân sự có thể nhiều nhóm quyền; tránh bảo mật chỉ ở UI.

## ADR-004: Snapshot thương mại
Dòng đơn copy mã/tên/ĐVT/đơn giá/bảo hành lúc tạo. Sửa danh mục không đổi đơn cũ.

## ADR-005: Hoàn tất cần bằng chứng
Ảnh phiếu xác nhận có chữ ký là attachment gắn `revision_no`; lệnh `complete` đòi có bằng chứng của lần chỉnh sửa hiện tại.

## ADR-006: Audit trước, KPI sau
KPI tính từ `audit_events`, `assignments`, `defect_records` bất biến. Công thức KPI chưa chốt (Q10) nhưng việc ghi sự kiện không chờ công thức.

## ADR-007: Trạng thái task là dữ liệu suy ra
Trạng thái task tính từ assignment của chu kỳ hiện tại theo bảng ưu tiên; lưu lại để truy vấn nhưng luôn tính lại trong cùng transaction. Có invariant test đảm bảo không lệch.

## ADR-008: Tiền là số nguyên VND
`BIGINT`, làm tròn half-up khi nhân số lượng thập phân và VAT. Không dùng float ở cả BE lẫn FE.

## ADR-009: SQLAlchemy sync
Chọn sync + psycopg3 thay vì async để giảm độ phức tạp, dễ test và dễ cho AI viết đúng; tải dự kiến (~30 người dùng) không cần async.

## ADR-010: Type chia sẻ qua OpenAPI
Frontend không viết tay type API. `make contract` xuất `openapi.json` và sinh `frontend/src/lib/api/schema.d.ts`; CI fail nếu file sinh ra khác bản commit.

## ADR-011: Image đa kiến trúc
Dev arm64 (M2), prod amd64 (AlmaLinux). Image production build với `--platform linux/amd64` và chạy smoke test trên runner amd64 của CI. Không phụ thuộc native lib không có wheel amd64/arm64.

## ADR-013: Giá tách VAT theo dòng, cờ giá cố định
Bối cảnh: báo giá thực tế có mặt hàng giá gồm VAT, có mặt hàng cộng VAT 8% riêng; một số giá không được phép thương lượng. Quyết định (Q01, Q16–Q18): sản phẩm/dịch vụ lưu giá chưa VAT, `vat_rate` (numeric, chọn nhanh 0/8/10 hoặc nhập tuỳ ý) và `price_fixed`. Dòng đơn snapshot cả ba; VAT tính và làm tròn từng dòng; `price_fixed` chỉ khoá đơn giá (giảm giá và tặng kèm vẫn được). Hệ quả: một đơn có nhiều mức VAT; hiển thị tổng theo mức VAT; server kiểm tra `PRICE_FIXED`.

## ADR-012: Tài liệu tham khảo là minh hoạ, không phải đặc tả
Ảnh phiếu viết tay chỉ dùng để suy ra trường dữ liệu. Trường chưa chắc chắn ghi vào `OPEN_QUESTIONS.md` với giả định mặc định.
