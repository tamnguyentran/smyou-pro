## <Backlog ID> — <Tên tính năng>

Spec: `docs/specs/<ID>-….md` · Review: `reports/review-<ID>.md`

### Thay đổi (người dùng thấy gì)
-

### Bảng AC → Test
| AC | Test | Kết quả |
|---|---|---|
| AC-… | `backend/tests/...::test_...` | ✅ |

### Bằng chứng kiểm chứng (dán từ `reports/verification.md`, output thật)
| Gate | Kết quả |
|---|---|
| lint / typecheck | |
| unit / integration / generated / stateful (coverage) | |
| contract drift | |
| migrations up/down | |
| AC traceability | |
| e2e mobile + desktop + axe | |

### Review độc lập
- code-reviewer: PASS / đã sửa N finding
- test-auditor: PASS / tampering: none
- security-auditor: PASS / N/A
- ui-reviewer: PASS / N/A

### Screenshots (390px & 1440px)
Xem artifact `e2e-report-and-screenshots` của CI hoặc `reports/screenshots/`.

### Giả định mới / cần chủ dự án quyết định
- none

### Checklist
- [ ] Test viết trước ở commit `test(<ID>)`, không bị sửa sau đó
- [ ] Không thêm `skip`/`ignore`/`disable`
- [ ] `spec/*.yaml` không đổi, hoặc thay đổi đã được chủ dự án duyệt
- [ ] Docs & backlog cập nhật
