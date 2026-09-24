# Quy trình phát triển với AI (Spec → Test → Code → Verify → Review → Ship)

## 0. Tư tưởng nền tảng (tổng hợp từ thực hành phổ biến)
| Nguyên tắc | Nguồn | Áp dụng ở dự án |
|---|---|---|
| Cho AI một cách **tự kiểm chứng** công việc (test, typecheck, screenshot) — yếu tố tăng chất lượng lớn nhất | Anthropic, *Claude Code best practices* | `make check-fast`/`verify`, Stop hook, Playwright screenshot |
| **Explore → Plan → Code → Commit**; dùng plan mode cho việc nhiều file | Anthropic | skill `/implement` bắt buộc bước plan |
| **TDD**: viết test trước, commit test, rồi code đến khi xanh, không sửa test | Anthropic; Kent Beck (*augmented coding*) | commit `test:` tách riêng; hook chặn skip; test-auditor kiểm tra test không bị sửa |
| **Spec-driven**: spec → kế hoạch → việc nhỏ, AI làm từng việc | Harper Reed (*LLM codegen workflow*); GitHub Spec Kit | `docs/specs/*.md` + backlog lát cắt dọc |
| **Người viết ≠ người review**: review bằng context sạch/agent khác | Anthropic (multi-Claude, subagents) | `/review` chạy 4 subagent độc lập + Claude review trên PR |
| **Hooks cho luật tất định**, CLAUDE.md cho hướng dẫn | Anthropic (hooks) | chặn pattern gian lận test, tự format, tự chạy check khi dừng |
| **CLAUDE.md ngắn, tiết lộ dần** (progressive disclosure) — chi tiết ở docs/skills | Anthropic | CLAUDE.md chỉ là bản đồ + luật cứng |
| **Quy tắc nghiệp vụ dạng dữ liệu** để sinh test hàng loạt, người chỉ duyệt dữ liệu | Thực hành "executable specification" | `spec/*.yaml` → test ma trận quyền & chuyển trạng thái |
| **Con người sở hữu "cái gì", AI lo "làm thế nào"**; không merge code không hiểu ở phần rủi ro | Simon Willison (*vibe engineering*); Addy Osmani | bạn duyệt spec/AC/YAML + bằng chứng; code do cổng tự động + reviewer AI kiểm |
| Lát cắt nhỏ, commit thường xuyên, `/clear` giữa các việc | Anthropic; nhiều kỹ sư | 1 backlog item/phiên, diff ≤ ~400 dòng |

## 1. Vòng đời một backlog item

```
 [Bạn] chọn item trong BACKLOG.md
   │
   ▼
 /spec M3-02 ──► AI viết docs/specs/M3-02-*.md (AC dạng Given/When/Then, có ID)
   │               + liệt kê câu hỏi/giả định
   ▼
 [Bạn] đọc & duyệt spec (5–10 phút) — CỔNG DUYỆT DUY NHẤT BẮT BUỘC CỦA NGƯỜI
   │   sửa AC nếu sai → đổi "Status: Approved"
   ▼
 /implement M3-02
   ├─ 1. Explore: đọc spec, yaml, code liên quan (subagent Explore nếu rộng)
   ├─ 2. Plan: liệt kê file sẽ đổi, migration, endpoint, component, test cho từng AC
   ├─ 3. RED: viết test cho mọi AC → chạy thấy fail đúng lý do → commit "test(M3-02): ..."
   ├─ 4. GREEN: code tối thiểu đến khi test xanh (không sửa test ở bước 3)
   ├─ 5. REFACTOR: dọn dẹp, giữ xanh
   └─ 6. make verify → bằng chứng
   ▼
 /review ──► 4 subagent context sạch song song:
   │          code-reviewer · test-auditor · security-auditor · ui-reviewer (nếu có UI)
   │          → AI sửa finding High/Medium → make verify lại (tối đa 3 vòng, sau đó báo bạn)
   ▼
 /ship ──► branch + commit + PR (template bằng chứng) → CI đầy đủ + Claude review trên PR
   ▼
 [Bạn] xem PR: CI xanh? bảng AC đủ? screenshot ổn? → merge (≈2–5 phút)
   ▼
 Cuối mỗi milestone: [Bạn] UAT thủ công theo kịch bản trong spec (30–60 phút)
```

## 2. Cách ra lệnh cho AI (mẫu prompt)
- Bắt đầu item: `/spec M4-01` → duyệt → `/implement M4-01`.
- Sửa lỗi: "Bug: <mô tả, bước tái hiện, kết quả mong đợi>. Viết test tái hiện trước, xác nhận nó fail, rồi sửa." (luôn test-first cho bug).
- Hỏi/khám phá: "Chưa code. Đọc X, Y và giải thích luồng Z; liệt kê rủi ro." (dùng plan mode).
- Khi AI lạc hướng: nhấn Esc để dừng, `/rewind` về checkpoint, hoặc `/clear` và bắt đầu lại với spec rõ hơn — rẻ hơn sửa đi sửa lại.

## 3. Quy tắc phiên làm việc
- 1 backlog item / phiên; `/clear` khi xong. Context dài → chất lượng giảm.
- Làm song song 2 item độc lập: dùng `git worktree` (hoặc `claude --worktree`) mỗi item một thư mục/một phiên.
- AI **phải dừng và hỏi** khi: spec thiếu/mâu thuẫn; cần thêm thư viện; cần sửa `spec/*.yaml`, `docs/product/*`, migration đã merge, CI/hook; cùng một lỗi sửa 2 lần chưa được.
- AI không được tuyên bố "xong" mà không dán tóm tắt output `make verify`.

## 4. Mẫu spec tính năng
Xem `docs/specs/_TEMPLATE.md`. AC viết để **kiểm chứng được bằng máy**: có dữ liệu đầu vào cụ thể, người thao tác (vai trò), kết quả quan sát được (HTTP code, trạng thái, text trên màn hình).

## 5. Git
- Nhánh: `feat/M3-02-order-lines`, `fix/<mô-tả>`; không commit thẳng `main` (hook chặn).
- Commit theo Conventional Commits, tiếng Anh: `test(M3-02): ...`, `feat(M3-02): ...`, `fix: ...`, `docs: ...`.
- PR nhỏ, 1 item. Squash merge.
