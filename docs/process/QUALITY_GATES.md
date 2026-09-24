# Quality Gates — cơ chế kiểm tra chéo tự động

Mục tiêu: bạn **không phải đọc code**. Bạn chỉ duyệt *ý định* (spec, AC, YAML) và *bằng chứng* (CI, bảng truy vết AC, screenshot). Mọi thứ còn lại do các lớp kiểm tra độc lập nhau bắt lỗi — mỗi lớp bắt một loại lỗi mà lớp khác bỏ sót.

## 1. Các lớp phòng thủ

| # | Lớp | Công cụ | Bắt được | Chạy ở |
|---|---|---|---|---|
| L0 | **Spec dạng dữ liệu** | `spec/state_machines.yaml`, `spec/permissions.yaml` | AI hiểu sai luật nghiệp vụ — bạn duyệt 2 file ngắn thay vì hàng nghìn dòng code | bạn duyệt |
| L1 | **Truy vết AC → test** | `scripts/check_ac_coverage.py` | AC bị bỏ quên, không có test | `make check`, CI |
| L2 | **Guardrail trong phiên** | Claude Code hooks (`.claude/hooks/`) | AI skip test, `type: ignore`, commit lên main, `--no-verify`, xoá volume DB, sửa `.env` | mỗi lần AI sửa file/chạy lệnh |
| L3 | **Tĩnh** | ruff, mypy strict, import-linter; eslint strict, tsc strict, prettier | lỗi kiểu, vi phạm kiến trúc (domain import DB…), code chết | Stop hook, pre-commit, CI |
| L4 | **Unit domain** | pytest + **Hypothesis** (property-based) | sai công thức tiền/VAT, sai suy ra trạng thái task | Stop hook, CI |
| L5 | **Stateful workflow** | Hypothesis `RuleBasedStateMachine` chạy chuỗi lệnh ngẫu nhiên | vi phạm invariant (đơn COMPLETED mà còn task chưa xong…) — lỗi mà test viết tay không nghĩ tới | CI |
| L6 | **Ma trận sinh tự động** | test đọc YAML | mọi (vai trò × quyền) và mọi (trạng thái × lệnh) — cả trường hợp bị cấm; route chưa khai báo quyền | CI |
| L7 | **Integration API** | pytest + Postgres thật | SQL, transaction, khoá, scope dữ liệu (IDOR) | CI |
| L8 | **Fuzz theo hợp đồng** | schemathesis từ OpenAPI | 500 do input lạ, response lệch schema | CI |
| L9 | **Hợp đồng FE↔BE** | openapi-typescript + `git diff --exit-code` | FE dùng field không tồn tại/đổi kiểu | CI (`make contract`) |
| L10 | **Component FE** | Vitest + Testing Library + MSW | logic form, hiển thị theo quyền, 4 trạng thái trang | Stop hook, CI |
| L11 | **E2E người dùng thật** | Playwright (iPhone 13 + Desktop 1440) + axe | luồng xuyên 4 vai trò hỏng, lỗi a11y, cuộn ngang mobile | `make e2e`, CI |
| L12 | **Mutation testing** | mutmut trên `modules/*/domain.py` | test "cho có" (không assert gì thật) — AI hay mắc | nightly CI, ngưỡng ≥ 80% mutant bị giết |
| L13 | **Migration** | alembic upgrade → downgrade -1 → upgrade; `alembic check` | model lệch migration, downgrade hỏng | CI |
| L14 | **Bảo mật chuỗi cung ứng** | gitleaks, pip-audit, npm audit, trivy image | lộ secret, thư viện có CVE | pre-commit, CI |
| L15 | **Review AI độc lập** | 4 subagent (`/review`) + Claude Code Action trên PR | lỗi logic, lệch spec, lỗ hổng phân quyền, UI sai guideline | trước PR + trên PR |
| L16 | **Image production** | build `linux/amd64` + smoke test | lỗi chỉ có trên kiến trúc prod | CI |
| L17 | **Người** | bạn | sai *ý định* nghiệp vụ, trải nghiệm thực tế | duyệt spec, UAT cuối milestone |

## 2. Ngưỡng bắt buộc (CI fail nếu không đạt)
| Chỉ số | Ngưỡng |
|---|---|
| Coverage backend (line + branch) | ≥ 85% tổng; `modules/*/domain.py` ≥ 95% |
| Coverage frontend (`src/features`, `src/lib`) | ≥ 75% |
| AC có test | 100% với spec `Approved`/`Done` |
| Route có khai báo capability | 100% |
| Cặp (trạng thái, lệnh) bị cấm có test 409 | 100% (sinh tự động) |
| axe serious/critical | 0 |
| Mutation score domain (nightly) | ≥ 80% |
| Lỗi ruff/mypy/eslint/tsc | 0 (không có suppression trần) |

## 3. Chống "AI gian lận để xanh"
Các mẫu hành vi AI hay mắc và cơ chế chặn:
| Hành vi | Chặn bằng |
|---|---|
| Xoá/sửa assertion để test pass | test viết ở commit `test:` riêng; test-auditor chạy `git diff <commit test>..HEAD -- <file test>` và báo mọi thay đổi |
| `skip`, `xfail`, `.only`, `@ts-ignore`, `type: ignore`, `noqa`, `eslint-disable` không lý do | PreToolUse hook `guard_edits.py` chặn ngay khi AI ghi file |
| Mock chính thứ đang test / test tautology | test-auditor + mutation testing |
| Hard-code giá trị để khớp test | Hypothesis sinh input ngẫu nhiên; mutation |
| Tuyên bố "đã chạy test" không thật | Stop hook tự chạy `make check-fast`; PR template yêu cầu output; CI chạy lại độc lập |
| Bỏ `--no-verify` qua pre-commit, push thẳng main | hook `guard_bash.py` + branch protection trên GitHub |
| Thêm endpoint không kiểm quyền | test sinh tự động duyệt `app.routes` |
| Sửa luật nghiệp vụ trong YAML để khớp code | quyền `ask` với `spec/**` — Claude Code phải hỏi bạn |

## 4. Bạn review gì (và KHÔNG cần review gì)
**Cần (≈10–15 phút/item):**
1. Spec: AC có đúng nghiệp vụ không? Thiếu tình huống nào? (đặc biệt: ai được làm, khi nào bị cấm)
2. Diff của `spec/*.yaml` nếu có.
3. PR: CI xanh; bảng "AC → test" không thiếu; screenshot mobile/desktop trông đúng; mục "Giả định mới" trong PR.

**Không cần:** đọc từng dòng code, style, cấu trúc file — đã có linter, kiến trúc test, reviewer AI.

**Nên tự tay thử (cuối milestone):** chạy kịch bản UAT trong spec trên điện thoại thật với 4 tài khoản mẫu. Đây là nơi phát hiện "đúng spec nhưng sai ý".

## 5. Khi nào vẫn phải đọc code
- Code bảo mật: đăng nhập, cookie/JWT, upload file, `apply_scope` — đọc 1 lần khi tạo (M1, M6).
- Migration xoá/đổi cột có dữ liệu thật.
- Khi reviewer AI và CI bất đồng hoặc cùng một bug quay lại lần 2.

## 6. Thiết lập một lần trên GitHub (bạn làm)
1. Branch protection `main`: bắt buộc PR, bắt buộc các check `backend`, `frontend`, `contract`, `traceability`, `e2e`, `security`, `image` xanh; cấm force-push.
2. Cài Claude GitHub App: trong Claude Code chạy `/install-github-app` (tạo secret `CLAUDE_CODE_OAUTH_TOKEN` hoặc `ANTHROPIC_API_KEY`).
3. Bật Dependabot cho `pip`/`npm`/`github-actions`/`docker`.
