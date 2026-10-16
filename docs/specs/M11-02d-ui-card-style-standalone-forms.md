# M11-02d — Lan style thẻ (bỏ viền trang trí, giữ viền input) ra 3 trang form đơn lẻ

- **Status:** Done
- **Backlog:** M11-02d · **Milestone:** M11
- **Liên quan:** `docs/design/UI_GUIDELINES.md` §1.1 (nguyên tắc card không viền, trừ bảng/input/thẻ tô màu trạng thái — đã chốt ở M11-01), `docs/specs/M11-02a-ui-card-style-list-pages.md` + `docs/specs/M11-02b-ui-card-style-order-detail.md` + `docs/specs/M11-02c-ui-card-style-dispatch-kpi-audit.md` (mẫu đã duyệt, cùng khuôn mẫu). Không đụng `spec/*.yaml`, không đổi API/DB/phân quyền.

## 1. Mục tiêu
Là chủ dự án, tôi muốn khung thẻ bao ngoài ở 3 trang form đơn lẻ (Đăng nhập, Đổi mật khẩu, Hồ sơ cá nhân) có cùng style "nổi bằng bóng mờ, không viền" như phần còn lại của app, nhưng **vẫn giữ viền của từng ô nhập liệu bên trong** — vì viền input không phải viền trang trí của thẻ.

## 2. Phạm vi
- Trong phạm vi — đúng 1 đoạn `className` (khung `<section>` bao ngoài) mỗi file, bỏ `border border-line`, giữ `shadow-card`, tăng `p-6` → `p-7` (giữ nguyên `md:p-8`, theo đúng khuôn mẫu M11-02b: chỉ tăng mốc base, không đổi mốc `md:`/`lg:`):
  1. `frontend/src/features/auth/pages/LoginPage.tsx:28` — `<section>` khung form đăng nhập.
  2. `frontend/src/features/auth/pages/ChangePasswordPage.tsx:45` — `<section>` khung form đổi mật khẩu.
  3. `frontend/src/features/profile/pages/ProfilePage.tsx:55` — `<section>` khung trang hồ sơ cá nhân.
- **Không đụng** (viền input, không phải viền trang trí — ngoại lệ "input" ở UI_GUIDELINES §1.1):
  - `TextField`/`PasswordField` (`frontend/src/components/ui/TextField.tsx`, dùng trong cả 3 form) — giữ nguyên `border border-line` của từng ô nhập.
- **Không đụng** (control dạng nút, không phải thẻ — cùng ngoại lệ đã áp dụng ở M11-02b/02c cho `Button variant="secondary"`):
  - Nút "Đăng nhập"/"Đổi mật khẩu"/"Đăng xuất" (`Button` component, mọi variant).
  - Link "Đổi mật khẩu" trong `ProfilePage.tsx:58-63` — tái tạo lại style `Button variant="secondary"` (cùng class `border border-line bg-card ... hover:bg-sidebar-sub`) vì là `<Link>` thay cho `<button>`, không phải khung thẻ nội dung.
- Ngoài phạm vi: đổi copy, đổi hành vi submit/điều hướng, đổi bố cục bên trong form, đổi style `Button`/`TextField`/`PasswordField` dùng chung toàn app.

## 3. Acceptance Criteria
> Thuần UI, không đổi API/quyền/trạng thái — không có AC 403/404/409/422. Kiểm chứng bằng class CSS render ra + test không-hồi-quy hiện có (component mới thêm, e2e, lint).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-037 | `LoginPage` render, bất kỳ viewport | render | `<section>` khung form có `shadow-card`, `p-7` (giữ `md:p-8`); **không** có class `border`/`border-line`; ô Email và Mật khẩu (`TextField`/`PasswordField`) **vẫn giữ** viền input; submit form vẫn gọi đúng API đăng nhập (không hồi quy luồng đăng nhập hiện có) | component |
| AC-UI-038 | `ChangePasswordPage` render, bất kỳ viewport, cả 2 trường hợp `forced`=true/false | render | `<section>` khung form có `shadow-card`, `p-7` (giữ `md:p-8`); không còn `border`/`border-line`; 3 ô mật khẩu vẫn giữ viền input; nút "Đổi mật khẩu" và nút phụ (Đăng xuất khi `forced`, Huỷ khi không) vẫn hiện & hoạt động đúng như trước | component |
| AC-UI-039 | `ProfilePage` render, có dữ liệu `/me` | render | `<section>` khung trang có `shadow-card`, `p-7` (giữ `md:p-8` nếu có); không còn `border`/`border-line`; link "Đổi mật khẩu" **vẫn giữ** `border border-line` (không đổi — là control dạng nút); nút "Đăng xuất" vẫn hoạt động đúng | component |
| AC-UI-040 | `ProfilePage` render ở trạng thái loading và trạng thái lỗi `/me` | render | khung `<section>` ngoài vẫn đúng style ở AC-UI-039 ở cả 2 trạng thái; nội dung khung bên trong (skeleton / `MeError`) không đổi | component |
| AC-UI-041 | Trang Đăng nhập, Đổi mật khẩu, Hồ sơ cá nhân ở 390px và 1440px (e2e hiện có: `auth.spec.ts`, `auth-review.spec.ts`) | chạy lại sau khi sửa | không có vi phạm axe-core `serious`/`critical` mới; không hồi quy luồng đăng nhập/đổi mật khẩu bắt buộc lần đầu/đăng xuất đã có | e2e |
| AC-UI-042 | `scripts/check_no_raw_colors` | chạy sau khi sửa 3 file trên | 0 vi phạm mới | lint |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Mỗi file chỉ đổi 1 class string của khung `<section>` bao ngoài: bỏ `border border-line`, giữ nguyên `shadow-card`, `p-6` → `p-7`, giữ nguyên `md:p-8`/`md:max-w-md` — theo đúng khuôn mẫu "chỉ tăng mốc base, giữ nguyên mốc responsive" đã dùng ở `OrderInfoTab` (M11-02b, `p-5 (lg:p-6 giữ nguyên)`).
- Viền của `TextField`/`PasswordField` (ô nhập) giữ nguyên hoàn toàn — ngoại lệ "input" ở UI_GUIDELINES §1.1, đây chính là điểm cần phân biệt mà backlog item nêu ra.
- Link "Đổi mật khẩu" ở `ProfilePage` tái dùng y hệt class của `Button variant="secondary"` (không qua component `Button` vì là điều hướng, không phải submit) — giữ nguyên, không phải thẻ nội dung.
- Không đổi copy, không đổi bố cục bên trong form, không đổi hành vi submit/điều hướng/đăng xuất.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Mở trang Đăng nhập (390px và 1440px) — khung thẻ form không còn viền kẻ, có bóng mờ nhẹ; ô Email/Mật khẩu vẫn có viền rõ ràng như cũ; đăng nhập vẫn hoạt động.
2. Mở trang Đổi mật khẩu qua link "Quên mật khẩu lần đầu" hoặc từ Hồ sơ cá nhân — khung thẻ bỏ viền; 3 ô mật khẩu vẫn có viền; đổi mật khẩu vẫn hoạt động.
3. Mở Hồ sơ cá nhân (390px) — khung trang bỏ viền; nút/link "Đổi mật khẩu" vẫn có viền (giống nút phụ mọi nơi khác trong app).
4. Thử tải lại trang Hồ sơ cá nhân khi mất mạng (trạng thái lỗi `/me`) — khung ngoài vẫn đúng style mới, không vỡ layout.
5. Đăng xuất từ trang Hồ sơ cá nhân và từ trang Đổi mật khẩu (trường hợp bắt buộc đổi lần đầu) — cả hai vẫn hoạt động đúng như trước.

## 8. Giả định & câu hỏi
- Giả định: tiếp tục đúng khuôn mẫu đã duyệt ở M11-01/M11-02a/M11-02b/M11-02c (class string), không có quyết định thiết kế mới.
- Giả định: mốc `p-6` → `p-7` (thay vì `p-5`) vì khung các form này dùng base `p-6` (lớn hơn `p-4` của các thẻ danh sách đã sửa trước đó) — áp dụng đúng quy tắc "tăng 1 mốc so với hiện trạng, giữ nguyên mốc responsive" đã dùng ở `OrderInfoTab` (M11-02b).
- Giả định: link "Đổi mật khẩu" trong `ProfilePage` là control dạng nút (tái tạo style `Button variant="secondary"`), không phải thẻ nội dung — áp dụng đúng ngoại lệ đã chốt cho `Button variant="secondary"` ở M11-02b/M11-02c.
- Không có câu hỏi mới cần chủ dự án quyết — nguyên tắc đã chốt ở M11-01, item này chỉ áp dụng lại đúng khuôn mẫu lên 3 trang form đơn lẻ còn lại, đồng thời làm rõ ranh giới "viền trang trí của thẻ" (bỏ) vs "viền input/control dạng nút" (giữ) mà backlog item yêu cầu.
