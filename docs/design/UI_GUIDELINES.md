# UI Guidelines — SMYou Pro

Chuyển thể từ `Tài liệu tham khảo/UI.md` (bản gốc giữ nguyên để tham khảo code mẫu). Phần gốc về "Workspace / Dự án" **không áp dụng**; menu cấp 2 ở đây là menu theo vai trò (`spec/permissions.yaml`).

## 1. Nguyên tắc
1. **Sang trọng, tiết chế:** nền Deep Slate Teal `#0F2F2E` cho điểm nhấn chính, vàng hổ phách `#D97706` cho CTA/biểu tượng nổi bật; viền 1px `#E2E8F0`; bóng mờ nhẹ.
2. **Thân thiện:** bo `rounded-xl`/`rounded-2xl`, khoảng trắng thoáng, chuyển động `duration-200 ease-in-out`, mỗi mục menu/trạng thái/nút chính có icon lucide.
3. **Quét nhanh:** trạng thái luôn là badge màu + chữ (không chỉ màu); con số quan trọng (hạn chót, số giờ, tổng tiền) in đậm.
4. **Mobile-first:** viết class cho 390px trước, mở rộng bằng `md:` (≥768) và `lg:` (≥1024). KTV dùng 1 tay ngoài hiện trường.

## 2. Design tokens (Tailwind v4 — `frontend/src/styles/index.css`)
```css
@import "tailwindcss";
@theme {
  --font-sans: "Plus Jakarta Sans Variable", "Inter", system-ui, sans-serif;
  --color-brand: #0F2F2E;          --color-brand-hover: #164543;   --color-brand-light: #E6F0EE;
  --color-accent: #D97706;         --color-accent-light: #FEF3C7;
  --color-page: #F8FAFC;           --color-card: #FFFFFF;          --color-sidebar-sub: #F1F5F9;
  --color-line: #E2E8F0;
  --color-heading: #0F172A;        --color-body: #334155;          --color-muted: #64748B;  --color-placeholder: #94A3B8;
  --shadow-card: 0 2px 8px rgba(15,47,46,0.04);
  --shadow-card-hover: 0 8px 20px rgba(15,47,46,0.08);
}
```
Không dùng mã màu hex rời rạc trong component (`bg-[#0F2F2E]` ❌ → `bg-brand` ✅). Test lint (`scripts/check_no_raw_colors`) bắt lỗi này.

### Màu trạng thái
| Token | bg / text / border | Dùng cho |
|---|---|---|
| `todo` | `#F1F5F9` / `#475569` / `#CBD5E1` | Nháp, Chờ tiếp nhận, Đã huỷ, Đã gỡ |
| `in_progress` | `#EFF6FF` / `#1D4ED8` / `#BFDBFE` | Đang thực hiện |
| `review` | `#FFFBEB` / `#B45309` / `#FDE68A` | Chờ điều phối, Đã tiếp nhận, Chờ khách xác nhận |
| `completed` | `#ECFDF5` / `#047857` / `#A7F3D0` | Hoàn thành, Hoàn tất |
| `urgent` | `#FEF2F2` / `#B91C1C` / `#FECACA` | Chỉnh sửa, Cần giao lại, Từ chối, Quá hạn, ưu tiên Khẩn |

Ánh xạ trạng thái → token lấy từ trường `color` trong `spec/state_machines.yaml`.

### Typography
| Vai trò | Class |
|---|---|
| H1 tiêu đề trang | `text-2xl lg:text-3xl font-bold tracking-tight text-heading` |
| H2 section | `text-lg lg:text-xl font-semibold text-heading` |
| H3 tiêu đề card | `text-base font-semibold text-heading` |
| Nội dung | `text-sm text-body leading-relaxed` |
| Meta/caption | `text-xs font-medium text-muted` |
| Số tiền | `tabular-nums font-semibold` |

## 3. Layout desktop (≥1024px)
- `flex h-dvh overflow-hidden bg-page`.
- **Sidebar `w-72`** (trắng, `border-r border-line`):
  - Header: logo SMYou (khối `rounded-xl bg-brand` + chữ vàng) + "SMYou Pro" + tên vai trò hiện tại.
  - Menu cấp 1 (icon + nhãn + badge đếm); mục đang chọn: `bg-brand text-white` với icon `text-accent`.
  - Menu cấp 2: accordion, thụt `ml-4 pl-4 border-l-2 border-line`, chấm màu + nhãn + badge.
  - Footer: avatar chữ cái đầu, tên, vai trò, nút Cài đặt cá nhân & Đăng xuất.
- **Top bar `h-16` sticky:** tiêu đề trang + badge trạng thái, ô tìm kiếm (`Ctrl/⌘ K` — tìm đơn/khách/task theo mã, tên, SĐT), chuông thông báo có badge, nút CTA chính theo vai trò (nền brand, dấu `+` vàng).
- Nội dung `p-4 lg:p-8 max-w-7xl mx-auto`. Danh sách dạng bảng; chi tiết dạng 2 cột (thông tin trái, hoạt động/timeline phải).

## 4. Layout mobile (<768px)
- **Header** `h-14` sticky: hamburger (mở drawer), tiêu đề, chuông.
- **Drawer** trái `w-80` trượt `transition-transform duration-300` + overlay; chứa đúng menu 2 cấp như desktop (accordion). Đóng khi chọn mục / chạm overlay / Esc.
- **Bottom navigation** cố định 5 vị trí (từ `mobile_bottom_nav` trong permissions.yaml): Tổng quan · (Việc của tôi | Bảng đầu việc | Đơn hàng — theo vai trò) · **nút tròn + nổi bật** (hành động chính theo vai trò, ẩn nếu không có) · Thông báo · Cá nhân. Chừa `pb-[env(safe-area-inset-bottom)]`; nội dung trang có `pb-24` để không bị che.
- Danh sách = card xếp dọc (không bảng ngang). Bảng rộng không bao giờ gây cuộn ngang trang.
- Form dài chia section; nút submit dính đáy (`sticky bottom-0`) trên mobile.
- Hộp thoại = **bottom sheet** trên mobile, modal giữa màn hình trên desktop (component `Sheet`).

## 5. Màn hình then chốt
| Màn hình | Vai trò | Ghi chú thiết kế |
|---|---|---|
| Việc của tôi | KTV | Tab: Chờ nhận / Đang làm / Đã xong. Card: mã task, tiêu đề, khách + địa chỉ (chạm để mở Google Maps), SĐT (chạm để gọi), hạn chót (đỏ nếu < 24h hoặc quá hạn), số giờ. Nút lớn theo trạng thái: **Tiếp nhận** / **Từ chối** → **Bắt đầu** → **Hoàn thành**. Vuốt là tuỳ chọn, luôn có nút. |
| Từ chối task | KTV | Bottom sheet: chọn lý do (chip BUSY/SICK/SKILL/DISTANCE/OTHER) + ô mô tả bắt buộc (≥5 ký tự). |
| Tải phiếu xác nhận | KTV/QLKT | `<input type="file" accept="image/*" capture="environment">`, nén ảnh phía client (cạnh dài ≤ 2000px, JPEG 0.85), xem trước, nhập tên người ký, tiến trình tải. |
| Đơn chờ điều phối | QLKT | Danh sách đơn PENDING_DISPATCH sắp theo ưu tiên + ngày hẹn; mở đơn → panel tạo task (gợi ý giờ từ dịch vụ trong đơn). |
| Bảng đầu việc | QLKT | Kanban theo trạng thái task (desktop), danh sách lọc theo trạng thái (mobile). Task NEEDS_ASSIGNEE nổi đỏ đầu cột. |
| Lịch & tải việc | QLKT | Theo nhân viên: tổng giờ ước tính task đang mở, hạn chót gần nhất — giúp chọn người khi giao. |
| Tạo/sửa đơn | Sale | Chọn/tạo nhanh khách; thêm dòng bằng ô tìm sản phẩm/dịch vụ (mã, tên); dòng tự do; tổng tiền cập nhật ngay (hiển thị), server tính lại khi lưu. Dòng **giá cố định**: ô đơn giá chỉ đọc + icon `Lock` + tooltip "Giá cố định"; ô giảm giá và công tắc "Tặng kèm" vẫn dùng được. VAT: chip chọn nhanh 0% · 8% · 10% + "Khác" mở ô nhập số. Cuối đơn: bảng tổng theo từng mức VAT. |
| Chi tiết đơn | tất cả | Header: mã, trạng thái, khách; tab: Thông tin · Dòng hàng (ẩn giá nếu không có quyền) · Đầu việc · Tệp đính kèm · Lịch sử (timeline audit). Hành động hiển thị theo `allowed_commands`. |

## 6. Component & tương tác
- **Nút:** Primary `bg-brand hover:bg-brand-hover text-white rounded-xl px-4 py-2.5 font-semibold`; Accent (CTA tạo mới) icon vàng; Secondary viền `border-line`; Danger nền đỏ nhạt chữ đỏ. Chiều cao tối thiểu 44px trên mobile. Trạng thái loading: spinner + disable, chống bấm đôi.
- **Hành động phá huỷ/không đảo ngược** (huỷ đơn, hoàn tất, từ chối, mở lại): `ConfirmDialog` nêu rõ hậu quả.
- **Toast** sau mỗi lệnh thành công ("Đã tiếp nhận đầu việc DH2609-0035-T1"); lỗi từ `detail` của problem+json.
- **Trống:** icon lucide lớn màu muted + câu hướng dẫn + CTA.
- **Tải:** Skeleton đúng hình dạng nội dung, không spinner toàn trang.
- **Tiền:** `Intl.NumberFormat('vi-VN')` + " ₫" → `11.800.000 ₫`. **Ngày:** `dd/MM/yyyy HH:mm`; tương đối cho hạn chót ("còn 3 giờ", "quá hạn 1 ngày").
- **SĐT** hiển thị `0932 06 8787`, link `tel:`; địa chỉ có link bản đồ.

## 7. Icon (lucide-react) — dùng nhất quán
Tổng quan `LayoutDashboard` · Việc của tôi `ClipboardCheck` · Điều phối `Wrench` · Đơn hàng `ShoppingBag` · Khách hàng `Users` · Sản phẩm `Monitor` · Dịch vụ `Hammer` · Nhân sự `UserCog` · KPI `BarChart3` · Nhật ký `History` · Thông báo `Bell` · Camera/phiếu `Camera` · Tiếp nhận `CheckCircle2` · Từ chối `XCircle` · Bắt đầu `PlayCircle` · Hoàn thành `BadgeCheck` · Mở lại `RotateCcw` · Hạn chót `CalendarClock` · Số giờ `Timer` · Địa chỉ `MapPin` · Gọi `Phone` · Máy in `Printer` · Camera an ninh `Cctv` · Laptop `Laptop`.

## 8. Khả năng truy cập & chất lượng (được test tự động)
- axe-core không có vi phạm `serious`/`critical` trên mọi trang trong E2E.
- Tương phản ≥ 4.5:1 cho chữ; focus ring `focus-visible:ring-2 ring-brand ring-offset-2`.
- Mọi input có `<label>`; icon-only button có `aria-label` tiếng Việt.
- Không cuộn ngang ở 360px (E2E kiểm tra `scrollWidth <= clientWidth`).
- Lighthouse mobile (CI, trang đăng nhập + Việc của tôi): Performance ≥ 85, Accessibility ≥ 95.

## 9. Văn phong
Tiếng Việt có dấu, ngắn, chủ động, lịch sự: "Tiếp nhận", "Từ chối", "Bắt đầu làm", "Báo hoàn thành". Thông báo lỗi nói cách khắc phục: "Cần tải ảnh phiếu xác nhận có chữ ký khách trước khi hoàn tất đơn."
