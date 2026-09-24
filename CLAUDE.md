# SMYou Pro — Hướng dẫn cho AI coding agent

Ứng dụng quản lý đơn hàng → đầu việc (task) kỹ thuật cho Công ty TNHH SMYou (bán & lắp đặt máy tính, máy in, camera an ninh).
Luồng lõi: Sale/Manager tạo đơn → Quản lý kỹ thuật tạo task & giao người → Kỹ thuật viên nhận/từ chối → thực hiện → xong → khách ký xác nhận → đơn hoàn tất (có thể "Chỉnh sửa" để thêm/mở lại task, ghi nhận lỗi cho KPI).

## Nguồn sự thật (đọc theo nhu cầu, KHÔNG đọc hết một lúc)
| Cần biết | Đọc |
|---|---|
| Phạm vi, người dùng, yêu cầu phi chức năng | `docs/product/PRD.md` |
| Thực thể, trường dữ liệu, quan hệ | `docs/product/DOMAIN_MODEL.md` |
| Trạng thái & chuyển trạng thái (máy đọc được — **nguồn sự thật**) | `spec/state_machines.yaml` (+ giải thích ở `docs/product/WORKFLOWS.md`) |
| Vai trò, quyền, menu (máy đọc được — **nguồn sự thật**) | `spec/permissions.yaml` (+ `docs/product/PERMISSIONS.md`) |
| Thuật ngữ Việt ↔ tên trong code | `docs/product/GLOSSARY.md` |
| Câu hỏi chưa chốt + giả định mặc định đang dùng | `docs/product/OPEN_QUESTIONS.md` |
| Kiến trúc, cấu trúc thư mục, quy ước code/API/DB | `docs/architecture/ARCHITECTURE.md` |
| Các quyết định kiến trúc (ADR) | `docs/architecture/DECISIONS.md` |
| Build/deploy Mac M2 → AlmaLinux | `docs/architecture/DEPLOYMENT.md` |
| UI: token màu, layout, menu, component | `docs/design/UI_GUIDELINES.md` (gốc: `Tài liệu tham khảo/UI.md`) |
| Quy trình làm một tính năng | `docs/process/WORKFLOW.md` |
| Cổng chất lượng & chiến lược test | `docs/process/QUALITY_GATES.md`, `docs/process/TESTING_STRATEGY.md` |
| Việc cần làm tiếp theo | `docs/backlog/BACKLOG.md` |
| Spec từng tính năng (có Acceptance Criteria) | `docs/specs/*.md` |

Nếu tài liệu mâu thuẫn: `spec/*.yaml` > `docs/specs/<feature>.md` đã Approved > `docs/product/*` > phần còn lại. Gặp mâu thuẫn hoặc thiếu thông tin nghiệp vụ → **dừng và hỏi**, ghi vào `OPEN_QUESTIONS.md`, không tự bịa quy tắc nghiệp vụ.

## Lệnh (luôn dùng Makefile, không tự chế lệnh)
- `make up` / `make down` — chạy stack dev (Postgres, backend, frontend) bằng Docker Compose
- `make check-fast` — lint + typecheck + unit test (chạy sau mỗi thay đổi đáng kể; Stop hook tự chạy)
- `make check` — toàn bộ cổng trước commit: lint, typecheck, unit + integration, contract, AC coverage, migration
- `make e2e` — Playwright (mobile + desktop) trên stack Docker
- `make verify` — `check` + `e2e` + in báo cáo bằng chứng; bắt buộc trước khi nói "xong"
- `make migration name=<mô_tả>` — tạo Alembic migration; `make contract` — sinh lại OpenAPI + TS types

## Quy tắc bắt buộc
1. **Không làm gì khi chưa có spec Approved.** Mỗi tính năng bắt đầu từ `docs/specs/<ID>.md` có Acceptance Criteria (`AC-XXX-NNN`). Không có → chạy `/spec`.
2. **Test trước (TDD).** Viết test đỏ cho từng AC trước, commit riêng (`test: ...`), rồi mới code. Mỗi test ghi ID AC nó chứng minh (`@pytest.mark.ac("AC-ORD-001")` hoặc `test("AC-ORD-001 ...")`).
3. **Không bao giờ làm yếu test để cho qua**: không xoá/sửa assertion của test đã commit ở bước đỏ, không `skip`/`xfail`/`.only`, không `# type: ignore`/`@ts-ignore`/`eslint-disable`/`# noqa` trần. Hook sẽ chặn. Test sai spec → báo người dùng.
4. **Trạng thái chỉ đổi qua lệnh (command) ở backend**, được kiểm tra theo `spec/state_machines.yaml`. Không có API `PATCH status`. Frontend không bao giờ tự suy luận quyền/trạng thái cuối cùng.
5. **Phân quyền ở server** cho mọi endpoint (capability + scope). Menu frontend chỉ là hình chiếu của quyền. Endpoint mới mà không khai báo capability → test sẽ fail.
6. **Tiền = số nguyên VND (`BIGINT`)**, không float. Thời gian lưu `timestamptz` UTC, hiển thị `Asia/Ho_Chi_Minh`.
7. **Đơn hàng lưu snapshot** tên/mã/đơn giá/bảo hành của sản phẩm-dịch vụ tại thời điểm tạo; sửa danh mục không được làm đổi đơn cũ.
8. **Mọi chuyển trạng thái ghi `audit_events`** (append-only) — dữ liệu KPI dựa vào đây.
9. Không sửa file migration đã merge; tạo migration mới. Không đọc/ghi `.env` thật.
10. Code, tên biến, commit message: tiếng Anh. Chuỗi hiển thị UI, thông báo lỗi cho người dùng: tiếng Việt có dấu.
11. Mobile-first: thiết kế cho 390px trước, rồi `md:`/`lg:`. Vùng chạm ≥ 44px. Dùng icon `lucide-react`.
12. Làm theo lát cắt dọc nhỏ (1 backlog item/phiên). Diff lớn hơn ~400 dòng code (không tính test) → tách nhỏ.

## Định nghĩa "Xong" (Definition of Done)
- [ ] Mọi AC trong spec có ít nhất 1 test và đều xanh (`make ac` pass)
- [ ] `make verify` xanh; đính kèm tóm tắt output (không nói "chắc là chạy được")
- [ ] Đã chạy `/review` (subagent độc lập) và xử lý hết finding mức High/Medium
- [ ] UI thay đổi → có screenshot 390px và 1440px trong `reports/screenshots/`
- [ ] Cập nhật `docs/backlog/BACKLOG.md` (trạng thái) và docs liên quan nếu hành vi thay đổi

## Cách làm việc với Claude Code
- Luồng chuẩn: `/spec <ID>` → người duyệt → `/implement <ID>` → `/review` → `/ship`. Chi tiết: `docs/process/WORKFLOW.md`.
- Việc nhiều file: bật plan mode, trình bày kế hoạch trước khi sửa.
- Dùng subagent cho việc tìm kiếm rộng và review; review phải chạy trong context sạch, không phải context đã viết code.
- `/clear` giữa hai backlog item. Khi sửa sai 2 lần cùng một chỗ → dừng, tóm tắt, hỏi người dùng.
- Báo cáo trung thực: test fail thì nói fail kèm output; bước nào bỏ qua thì nói rõ.
