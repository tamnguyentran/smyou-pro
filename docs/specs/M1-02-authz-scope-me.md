# M1-02 — Phân quyền theo phạm vi (scope) và `GET /me`

- **Status:** Approved
- **Approval:** chủ dự án duyệt (2026-09-26)
- **Backlog:** M1-02 · **Milestone:** M1
- **Liên quan:** `spec/permissions.yaml` (toàn bộ `capabilities`, `scopes`, `menu[].badge`); `docs/product/PERMISSIONS.md` (nguyên tắc 1–4); ADR-003; ARCHITECTURE §4 (`/me`), §6 (`Actor(id, roles, scopes)`, `apply_scope`); TESTING_STRATEGY §3 (`test_rbac_matrix.py`); M1-01a (`require()` xác thực + capability)

## 1. Mục tiêu
Là nhân viên SMYou, sau khi đăng nhập tôi (qua ứng dụng) hỏi được "tôi là ai, có những quyền gì, trên phạm vi nào", để menu và nút bấm ở các màn sau hiện đúng vai trò của mình. Là chủ dự án, tôi muốn **mọi** tổ hợp vai trò × quyền trong `spec/permissions.yaml` được máy kiểm tra tự động, và dữ liệu ngoài phạm vi của một người trả 404 như không tồn tại.

## 2. Phạm vi
- Trong:
  - Tính **phạm vi hiệu lực** của một capability cho một người nhiều vai trò: hợp các scope của các vai trò đang giữ; có `all` thì chỉ còn `all`.
  - `require(capability)` trả `Actor` kèm phạm vi hiệu lực của capability đó (`actor.scopes`).
  - Hàm dùng chung `apply_scope(query, actor, capability, rules)` lọc truy vấn đọc theo phạm vi, và `get_in_scope_or_404(...)` cho truy vấn 1 bản ghi. Mỗi module sau này (đơn, task, khách hàng…) khai báo cột/điều kiện cho từng scope (`own` → `created_by`, `assigned` → có assignment, `self` → chính người đó).
  - `GET /api/v1/me` (capability `profile.manage`, scope `self`): thông tin nhân viên, vai trò, bảng capability → phạm vi, `counters` (bộ đếm badge menu).
  - Registry bộ đếm badge: module đăng ký hàm đếm cho một khoá `badge` trong menu; `/me` chỉ trả khoá thuộc mục menu người đó thấy. **M1-02 chưa đăng ký bộ đếm nào** (đơn, task chưa tồn tại) → `counters: {}`.
  - Test sinh từ YAML: `tests/generated/test_rbac_matrix.py` (mọi capability × mọi vai trò + các cặp vai trò) và ma trận trên **route thật** của app.
  - Sinh lại OpenAPI + TS types (`make contract`).
- Ngoài: dùng `/me` ở giao diện, dựng menu, trang 403/404 (M1-03); bộ đếm thật `pending_dispatch_count`, `pending_assignments_count`, `revision_count` (M4-01, M5-01, M6-03); áp scope lên đơn/task/khách hàng thật (M3–M5); quản lý vai trò nhân viên (M1-04).

## 3. Acceptance Criteria
Dữ liệu mẫu: **Nguyễn Văn An** `an.nguyen@smyou.vn` `NV001` [MANAGER]; **Trần Minh Khoa** `khoa.tran@smyou.vn` `NV014` [TECHNICIAN], đã đổi mật khẩu; **Phạm Thu Hà** `ha.pham@smyou.vn` `NV007` [SALE, TECHNICIAN]; **Lê Anh Tuấn** `tuan.le@smyou.vn` `NV015` [TECHNICIAN], `must_change_password=true`.

### `GET /api/v1/me`
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-028 | An đã đăng nhập | `GET /api/v1/me` | 200; `employee = {id, code:"NV001", full_name:"Nguyễn Văn An", email:"an.nguyen@smyou.vn", title, department}`; `roles = ["MANAGER"]`; `capabilities` có **đúng** 21 capability MANAGER giữ trong YAML, mỗi giá trị là danh sách phạm vi (vd `"order.read": ["all"]`, `"profile.manage": ["self"]`); **không** có `task.manage`, `assignment.respond`; `counters = {}`; body không có `password_hash`, `failed_login_count`, `locked_until` | integration |
| AC-AUTH-029 | Khoa đã đăng nhập | `GET /me` | 200; `roles = ["TECHNICIAN"]`; `capabilities` đúng 11 mục của TECHNICIAN, vd `"order.read": ["assigned"]`, `"assignment.respond": ["self"]`, `"kpi.read": ["self"]`; không có `order.create`, `catalog.read` | integration |
| AC-AUTH-030 | Hà giữ 2 vai trò SALE + TECHNICIAN | `GET /me` | `roles = ["SALE","TECHNICIAN"]` (sắp xếp theo thứ tự trong YAML); quyền là **hợp** của 2 vai trò: `"order.read": ["all"]` (all lấn át assigned), `"dashboard.read": ["own","self"]`, `"order.submit": ["own"]`, `"assignment.respond": ["self"]`, `"customer.manage": ["all"]`; không có `task.manage` | integration |
| AC-AUTH-031 | — | `GET /me`: không có cookie / cookie của người đã bị vô hiệu hoá / Tuấn chưa đổi mật khẩu lần đầu | lần lượt 401 `UNAUTHENTICATED` / 401 `UNAUTHENTICATED` / 403 `PASSWORD_CHANGE_REQUIRED` (giữ luật AC-AUTH-015) | integration |
| AC-AUTH-032 | Registry bộ đếm có một bộ đếm **thử** (chỉ trong test) cho khoá `pending_assignments_count` trả `3` | An, Khoa, Hà gọi `GET /me` | An: `counters = {}` (mục "Việc của tôi" cần `assignment.respond`, An không có); Khoa và Hà: `counters = {"pending_assignments_count": 3}`; bộ đếm nhận đúng `Actor` của người gọi. Đăng ký bộ đếm cho khoá không có trong `menu[].badge` → app không khởi động (`SpecError` nêu tên khoá) | unit + integration |

### Phạm vi hiệu lực & `require`
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-033 | YAML hiện tại | tính phạm vi hiệu lực cho mọi capability × mọi tập vai trò khác rỗng (15 tập) | kết quả = hợp các scope của các vai trò trong tập có giữ capability; có `all` → đúng `["all"]`; không vai trò nào giữ → rỗng. Thứ tự trong danh sách theo `scopes` của YAML | unit (generated) |
| AC-AUTH-034 | App thử có 1 route `require(cap)` cho **mỗi** capability trong YAML | gọi từng route với người giữ từng vai trò đơn, và từng cặp 2 vai trò (6 cặp) | có quyền → 200 và `actor.scopes` bằng phạm vi hiệu lực ở AC-AUTH-033; không có → 403 `FORBIDDEN` "Bạn không có quyền thực hiện thao tác này."; số ca kiểm tra tự tính từ YAML (sửa YAML → ma trận đổi theo, không sửa test) | generated (integration) |
| AC-AUTH-035 | App thật | với mỗi route **không** public, gọi bằng người giữ từng vai trò đơn | vai trò giữ capability của route → **không** 403; vai trò không giữ → 403 `FORBIDDEN`. Route mới thêm sau này tự vào ma trận | generated (integration) |

### Lọc theo phạm vi
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-036 | Bảng thử (chỉ trong test) có 4 bản ghi: 2 do Hà tạo, 1 do An tạo, 1 có Khoa trong danh sách được giao; luật phạm vi: `own` → `created_by = actor`, `assigned` → có Khoa/Hà trong danh sách giao, `self` → không hỗ trợ | `apply_scope` với phạm vi `all` / `own` (Hà) / `assigned` (Khoa) / `own`+`assigned` (Hà, cũng được giao 1 bản ghi) | lần lượt 4 / 2 / 1 / 3 bản ghi; khi chạy trên Postgres thật | integration |
| AC-AUTH-037 | Như trên | `apply_scope` với phạm vi mà luật của thực thể **không** khai báo (vd `self`), hoặc phạm vi rỗng | không trả bản ghi nào (đóng khi lỗi) và ghi log cảnh báo tên capability + scope; **không** bao giờ trả toàn bộ | unit + integration |
| AC-AUTH-038 | Như trên; Hà chỉ có phạm vi `own` | `get_in_scope_or_404` cho bản ghi do An tạo, và cho một UUID không tồn tại | cả hai: 404 `NOT_FOUND`, **cùng** `detail` và cùng body (không lộ bản ghi có tồn tại) | integration |

### Hợp đồng
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-039 | App thật | `make contract` | OpenAPI có `GET /api/v1/me`, `operationId = "me_get"`, response `MeResponse`, lỗi 401/403 được mô tả; `frontend/src/lib/api/schema.d.ts` sinh lại và không lệch (CI `contract` xanh); `test_routes_declare_capability` vẫn xanh | generated |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/me | profile.manage (self) | — | `MeResponse` | 401, 403 |

```jsonc
// MeResponse
{
  "employee": { "id": "uuid", "code": "NV007", "full_name": "Phạm Thu Hà", "email": "ha.pham@smyou.vn",
                "title": "Nhân viên kinh doanh", "department": "SALES" },
  "roles": ["SALE", "TECHNICIAN"],
  "capabilities": { "order.read": ["all"], "dashboard.read": ["own", "self"], "...": ["..."] },
  "counters": {}
}
```

## 5. Dữ liệu / Migration
Không có. (Bảng thử cho AC-AUTH-036–038 chỉ tạo trong test, không có migration.)

## 6. UI
Không có (M1-03 dùng `/me` để dựng menu). Frontend chỉ nhận types sinh lại.

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập trên trình duyệt bằng tài khoản Manager.
2. Mở `https://…/smyoutask/api/v1/me` (hoặc `localhost:6890/smyoutask/api/v1/me`) trong cùng trình duyệt → thấy tên, vai trò "MANAGER" và danh sách quyền, không thấy `task.manage`.
3. Đăng xuất, mở lại đường dẫn trên → báo "Vui lòng đăng nhập." (401).

## 8. Giả định & câu hỏi
Không có câu hỏi nghiệp vụ mới — mọi luật lấy từ `spec/permissions.yaml` và PERMISSIONS.md; **không** sửa YAML.

Giả định kỹ thuật (chủ dự án chỉ cần biết):
- `/me` dùng capability `profile.manage` (mọi vai trò đều có, scope `self`) thay vì thêm capability mới vào YAML.
- Giá trị trong `capabilities` là **danh sách** phạm vi (vd `["own","self"]`) chứ không phải một chuỗi như ví dụ ở ARCHITECTURE §4, vì người nhiều vai trò có thể có hai phạm vi cùng lúc (Hà: `dashboard.read` = của mình + bản thân). Sẽ cập nhật ví dụ trong ARCHITECTURE §4.
- Phạm vi lạ/không khai báo cho thực thể → trả rỗng (từ chối mặc định, PERMISSIONS nguyên tắc 3).
- Bộ đếm badge chưa có (đơn, task chưa tồn tại) → `counters: {}`; khoá xuất hiện khi module tương ứng được làm. Không trả số 0 giả.
- Nhân viên không còn vai trò nào → `/me` trả 403 (không có `profile.manage`). Việc có cho phép bỏ hết vai trò hay không sẽ quyết ở M1-04.
