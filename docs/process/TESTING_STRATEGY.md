# Testing Strategy

## 1. Kim tự tháp
```
            E2E Playwright (ít, luồng xuyên vai trò, mobile + desktop)
          ───────────────────────────────────────────
        Component FE (Vitest + MSW)   │  Contract/fuzz (schemathesis)
      ─────────────────────────────────────────────────────
    Integration API + Postgres thật (nhiều) + ma trận sinh từ YAML
  ─────────────────────────────────────────────────────────────
Unit domain thuần + property-based + stateful (nhiều nhất, nhanh nhất)
```

## 2. Liên kết test ↔ Acceptance Criteria
- Backend: `@pytest.mark.ac("AC-ORD-003")` (đăng ký marker trong `pyproject.toml`). Một test có thể mang nhiều AC.
- Frontend/E2E: ID nằm đầu tên test: `test("AC-ORD-003 Sale gửi đơn thành công", ...)`.
- `scripts/check_ac_coverage.py` quét `docs/specs/*.md` và toàn bộ file test, in bảng `AC → file test` vào `reports/ac-matrix.md`, fail nếu spec `Approved`/`Done` có AC chưa có test.

## 3. Backend
### Unit (`tests/unit`) — không DB, < 5 giây tổng
- Tính tiền: ví dụ cố định từ tài liệu thật (`24.770.000 → 26.751.600`) **và** property: `total == subtotal - discount + vat`, `vat ≥ 0`, làm tròn half-up, gift ⇒ 0.
- `derive_task_status`: bảng ví dụ đầy đủ các tổ hợp + property "kết quả là một trong 6 trạng thái và đúng thứ tự ưu tiên".
- Guard: mỗi guard 1 test pass + 1 test fail.

### Sinh từ YAML (`tests/generated`)
```python
# phác thảo — test_transition_matrix.py
MACHINE = load_state_machines()["order"]
ALL = [(s, t["command"]) for s in MACHINE["states"] for t in MACHINE["transitions"]]
ALLOWED = {(s, t["command"]) for t in MACHINE["transitions"] for s in t["from"]}

@pytest.mark.parametrize("state,command", sorted(set(ALL) - ALLOWED))
def test_forbidden_transition_returns_409(state, command, api, order_in_state): ...
```
- `test_rbac_matrix.py`: với mỗi capability × role: có quyền → không 403; không có → 403.
- `test_routes_declare_capability.py`: duyệt `app.routes`, mọi route phải có dependency `require(...)` hoặc nằm trong `public_routes`.
- `test_guards_implemented.py`: mọi guard trong YAML có hàm trong `GUARDS`, và ngược lại.
- `test_menu_sync.py`: `frontend/src/app/menu.ts` (xuất JSON) khớp `permissions.yaml.menu`.

### Stateful (`tests/stateful`)
`RuleBasedStateMachine` với rule: tạo đơn, submit, tạo task (1–3 KTV), accept/reject/start/complete ngẫu nhiên, upload phiếu, complete, request_revision, reopen, cancel… Sau mỗi bước kiểm tra toàn bộ `invariants` trong YAML. Chạy trên domain + repository in-memory (nhanh) và 1 profile chạy qua service + Postgres (CI, ít ví dụ hơn).

### Integration (`tests/integration`)
- Postgres thật (compose service `db`, database `smyou_test`); mỗi test chạy trong transaction rollback (SAVEPOINT).
- Mỗi endpoint: happy path, 422 validation, 403 thiếu quyền, 404 ngoài scope (IDOR: KTV A đọc assignment của KTV B), 409 sai trạng thái/guard, 409 `STALE_VERSION`.
- Đồng thời: 2 KTV cùng complete 2 assignment cuối cùng của task song song → đơn chỉ chuyển AWAITING_CONFIRMATION đúng 1 lần, đúng 1 audit event.
- Upload: file giả mạo đuôi `.jpg` nhưng là PDF/HTML → 415; > 10MB → 413.

### Contract (`tests/contract`)
`schemathesis` chạy trên app với user MANAGER đã đăng nhập: không route nào trả 500; mọi response khớp schema.

## 4. Frontend
- Component test cho mỗi page: render 4 trạng thái (loading/empty/error/success) với MSW.
- Menu: user có roles [SALE, TECH_LEAD] thấy đúng 2 nhóm menu; TECHNICIAN không thấy "Đơn hàng".
- Nút hành động chỉ hiện khi `allowed_commands` có lệnh.
- Format: tiền, ngày giờ VN, hạn chót tương đối.

## 5. E2E (Playwright)
- Project: `mobile` (iPhone 13, 390×844) và `desktop` (1440×900). KTV chỉ chạy mobile; Manager chạy cả hai.
- Dữ liệu: `scripts/seed_e2e.py` tạo 4 user mẫu (mỗi vai trò) + 1 user đa vai trò + danh mục mẫu từ báo giá thật.
- **Golden path** (bắt buộc từ M6): Sale tạo đơn camera → gửi → QLKT tạo 2 task giao 2 KTV → KTV1 từ chối (SICK) → QLKT giao KTV3 → các KTV nhận, bắt đầu, xong → KTV tải ảnh phiếu → QLKT hoàn tất → QLKT chuyển Chỉnh sửa, mở lại task 1 → KTV làm lại → hoàn tất lần 2 → KPI hiện 1 lỗi cho KTV của task 1.
- Mỗi trang: `checkA11y` (axe) và kiểm tra không cuộn ngang.
- Screenshot mỗi màn hình chính vào `reports/screenshots/{project}/{name}.png` (đính kèm PR để bạn liếc).

## 6. Dữ liệu test
- Factory (polyfactory) cho BE; không fixture JSON khổng lồ.
- Tên/địa chỉ tiếng Việt có dấu (bắt lỗi encoding): "Công ty CP XD Hạ tầng Minh Nghĩa", "186 Dương Công Khi, Xã Hóc Môn".
- Thời gian: freeze bằng `time-machine`; không phụ thuộc giờ máy.

## 7. Lệnh
| Lệnh | Chạy |
|---|---|
| `make test-unit` | BE unit + FE vitest (nhanh) |
| `make test` | + BE integration, generated, stateful |
| `make contract` | xuất OpenAPI, sinh TS types, fail nếu lệch |
| `make e2e` | Playwright trên stack Docker |
| `make mutation` | mutmut domain (chậm, nightly) |
| `make ac` | bảng truy vết AC |
