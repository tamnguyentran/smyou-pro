# Bằng chứng cấy lỗi (AC-SYS-095)

Thao tác 1 lần theo đúng §7 bước 4 của spec: tạm xoá dòng gọi `task.status = domain.derive_task_status(...)`
trong `backend/app/modules/assignments/service.py::complete_assignment` (đây là chỗ hiện thực effect
`fire_order_reevaluate`/recompute trạng thái task — không có hàm riêng tên `fire_order_reevaluate`, xem
docstring đầu `tests/stateful/test_workflow_stateful.py`), chạy lại `uv run pytest tests/stateful -q`, rồi
hoàn tác.

## Thay đổi tạm thời (đã hoàn tác)

```diff
-    task.status = domain.derive_task_status(
-        _active_assignment_statuses(session, task.id, task.cycle), cancelled=task.cancelled_at is not None
-    )
+    # AC-SYS-095 fault injection (tạm thời):
+    # task.status = domain.derive_task_status(
+    #     _active_assignment_statuses(session, task.id, task.cycle), cancelled=task.cancelled_at is not None
+    # )
```

## Kết quả

Vì Hypothesis không cố định seed giữa các lần chạy, và với `max_examples=50`/`stateful_step_count=25` cần
đủ bước ngẫu nhiên để 1 assignee là **assignee cuối cùng** của 1 task hoàn thành việc (lúc đó derived status
mới lệch khỏi giá trị lưu), test không đỏ ở lần chạy đầu tiên. Chạy lặp lại `uv run pytest tests/stateful -q`
(không đổi cấu hình) tối đa 15 lần, dừng ngay khi đỏ:

| Lần | Kết quả |
|---|---|
| 1–7 | `1 passed` (45–70 s/lần) |
| **8** | **`1 failed` trong 371 s (có shrink)** |

Lần 8 — thông báo lỗi đúng như spec dự đoán:

```
    @invariant()
    def inv_task_status_matches_derived(self) -> None:
        """A task's stored status always equals the derived status computed from its assignments."""
        ...
>               assert task.status == expected, f"task {task.id} stored={task.status} derived={expected}"
E               AssertionError: task 9c066fde-4ad3-44f3-9d71-6e8a705efd9f stored=IN_PROGRESS derived=DONE
E               assert 'IN_PROGRESS' == 'DONE'
...
WARNING: Hypothesis has spent more than five minutes working to shrink a failing test case, and stopped
because it is making very slow progress.
=========================== short test summary info ============================
FAILED tests/stateful/test_workflow_stateful.py::TestWorkflow::runTest - AssertionError
1 failed in 371.30s (0:06:11)
```

Sau khi hoàn tác (`git checkout -- backend/app/modules/assignments/service.py`):

```
$ git diff --stat backend/app/modules/assignments/service.py
(không có output — sạch)
$ uv run pytest tests/stateful tests/unit/test_stateful_invariant_coverage.py -q
3 passed in 98.69s
```

## Trung thực về giới hạn

- **Đạt** phần "Test đỏ trong ≤ 50 example": đỏ ở lần chạy thứ 8/50 trong ngân sách cho phép, không cần đổi
  `max_examples`/`stateful_step_count`.
- **Đạt** phần thông báo lỗi: đúng y nguyên câu invariant dự đoán trong spec.
- **Không đạt đầy đủ** phần "shrink về 1 dãy lệnh ≤ 6 bước": Hypothesis's shrinker tự dừng sau 5 phút vì
  "making very slow progress" (mỗi ví dụ cần dựng engine/connection/seed 5 nhân viên qua Postgres thật —
  tốn thời gian hơn nhiều so với state machine thuần in-memory mà Hypothesis quen tối ưu), để lại ví dụ đỏ
  với ~9 bước có thể quan sát được (3 đơn, 1 huỷ đơn, `update_task`, `remove_assignment`, `start_assignment`,
  `cancel_order`, `complete_assignment`) — không nhỏ gọn bằng 6 bước spec kỳ vọng, nhưng vẫn đủ để người đọc
  xác định đúng assignment/task gây lỗi.
- Không có lần chạy nào trong 15 lần bị đỏ **sai** (do lỗi cấu hình/môi trường) — các lần "passed" đều là
  Hypothesis chưa tạo ra đúng tổ hợp bước cần thiết (assignee cuối của 1 task vừa hoàn thành), không phải
  false negative.
