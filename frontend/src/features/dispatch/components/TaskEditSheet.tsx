import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, ClipboardList, RotateCcw, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { ApiError } from "../../auth/errors";
import { useMe } from "../../me/api";
import { PRIORITY_LABELS, PRIORITY_ORDER } from "../../orders/schemas";
import {
  useActiveTechnicians,
  useAddAssignee,
  useCancelTask,
  useRemoveAssignee,
  useReopenTask,
  useTask,
  useUpdateTask,
  type TaskAssignee,
  type TaskReopenBody,
} from "../api";
import {
  fromOffsetIso,
  hoursLabel,
  parseHours,
  priorityOrDefault,
  taskUpdateSchema,
  toOffsetIso,
  type TaskEditFormValues,
} from "../schemas";
import {
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_TONE,
  DISPATCHABLE_STATUSES,
  knownAssignmentStatus,
  knownTaskStatus,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  TERMINAL_TASK_STATUSES,
} from "../taskStatus";
import { CancelTaskSheet } from "./CancelTaskSheet";
import { ReopenTaskSheet } from "./ReopenTaskSheet";

const GENERIC_ERROR = "Không thực hiện được. Vui lòng thử lại.";
const FORM_ID = "task-edit-form";

function describeError(error: unknown): string {
  return error instanceof ApiError ? (error.problem.detail ?? GENERIC_ERROR) : GENERIC_ERROR;
}

/** AC-DSP-058…069: sheet sửa 1 đầu việc, mở từ `OrderTasksTab` (bấm vào dòng/thẻ task). Trạng
 * thái chỉ-xem suy ra thuần từ `TaskDetail` + `useMe()` — không cần truyền `Order` xuống. */
export function TaskEditSheet({
  orderId,
  taskId,
  onClose,
}: {
  orderId: string;
  taskId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const me = useMe();
  const detail = useTask(orderId, taskId, true);
  const technicians = useActiveTechnicians(true);
  const updateTask = useUpdateTask();
  const addAssignee = useAddAssignee();
  const removeAssignee = useRemoveAssignee();
  const cancelTask = useCancelTask();
  const reopenTask = useReopenTask();

  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [showReload, setShowReload] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TaskAssignee | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelStale, setCancelStale] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [reopenStale, setReopenStale] = useState(false);

  const { register, handleSubmit, formState, reset } = useForm<TaskEditFormValues>({
    resolver: zodResolver(taskUpdateSchema) as Resolver<TaskEditFormValues>,
    defaultValues: {
      title: "",
      description: "",
      estimated_hours: "",
      due_at: "",
      priority: "NORMAL",
    },
  });

  useEffect(() => {
    if (detail.data === undefined) return;
    reset({
      title: detail.data.title,
      description: detail.data.description ?? "",
      estimated_hours: hoursLabel(detail.data.estimated_hours),
      due_at: fromOffsetIso(detail.data.due_at),
      priority: priorityOrDefault(detail.data.priority),
    });
  }, [detail.data, reset]);

  const canManage =
    me.data !== undefined &&
    detail.data !== undefined &&
    "task.manage" in me.data.capabilities &&
    DISPATCHABLE_STATUSES.has(detail.data.order_status) &&
    !TERMINAL_TASK_STATUSES.has(detail.data.status);

  // AC-DSP-120/121: chỉ khi task đã DONE và đơn đang đúng REVISION (không phải mọi trạng thái
  // điều phối được của DISPATCHABLE_STATUSES) — khác gate của canManage ở trên.
  const canReopen =
    me.data !== undefined &&
    detail.data !== undefined &&
    "task.reopen" in me.data.capabilities &&
    detail.data.status === "DONE" &&
    detail.data.order_status === "REVISION";

  const assignedIds = new Set(detail.data?.assignees.map((assignee) => assignee.employee_id) ?? []);
  const candidates = (technicians.data ?? []).filter(
    (technician) => !assignedIds.has(technician.id),
  );
  const knownStatus = detail.data ? knownTaskStatus(detail.data.status) : undefined;

  async function onSubmit(values: TaskEditFormValues) {
    if (detail.data === undefined) return;
    setFormMessage(null);
    setShowReload(false);
    try {
      await updateTask.mutateAsync({
        orderId,
        taskId,
        body: {
          version: detail.data.order_version,
          title: values.title,
          description: values.description ? values.description : null,
          estimated_hours: parseHours(values.estimated_hours),
          due_at: toOffsetIso(values.due_at),
          priority: values.priority,
        },
      });
      toast("Đã lưu thay đổi đầu việc.");
    } catch (error) {
      if (error instanceof ApiError && error.problem.code === "STALE_VERSION") {
        setShowReload(true);
      }
      setFormMessage(describeError(error));
    }
  }

  async function handleAddAssignee(technician: { id: string; full_name: string }) {
    if (detail.data === undefined) return;
    setAssigneeError(null);
    try {
      await addAssignee.mutateAsync({
        orderId,
        taskId,
        body: { version: detail.data.order_version, employee_id: technician.id },
      });
      toast(`Đã thêm ${technician.full_name} vào đầu việc.`);
      setPickerOpen(false);
    } catch (error) {
      setAssigneeError(describeError(error));
    }
  }

  async function confirmRemove() {
    if (detail.data === undefined || removeTarget === null) return;
    setRemoveError(null);
    try {
      await removeAssignee.mutateAsync({
        orderId,
        taskId,
        assignmentId: removeTarget.id,
        body: { version: detail.data.order_version },
      });
      toast(`Đã gỡ ${removeTarget.full_name} khỏi đầu việc.`);
      setRemoveTarget(null);
    } catch (error) {
      setRemoveError(describeError(error));
    }
  }

  function submitCancel(reason: string) {
    if (detail.data === undefined) return;
    setCancelError(null);
    cancelTask.mutate(
      { orderId, taskId, body: { version: detail.data.order_version, reason } },
      {
        onSuccess: (updated) => {
          setCancelOpen(false);
          toast(`Đã huỷ đầu việc ${updated.code}.`);
          onClose();
        },
        onError: (error: unknown) => {
          if (error instanceof ApiError && error.problem.code === "STALE_VERSION") {
            setCancelStale(true);
          } else {
            setCancelError(describeError(error));
          }
        },
      },
    );
  }

  function submitReopen(reason: string, severity: TaskReopenBody["severity"]) {
    if (detail.data === undefined) return;
    setReopenError(null);
    reopenTask.mutate(
      { orderId, taskId, body: { version: detail.data.order_version, reason, severity } },
      {
        onSuccess: (updated) => {
          setReopenOpen(false);
          toast(`Đã mở lại đầu việc ${updated.code}.`);
        },
        onError: (error: unknown) => {
          if (error instanceof ApiError && error.problem.code === "STALE_VERSION") {
            setReopenStale(true);
          } else {
            setReopenError(describeError(error));
          }
        },
      },
    );
  }

  const title = detail.data ? `Sửa đầu việc — ${detail.data.code}` : "Sửa đầu việc";

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        dismissible={!updateTask.isPending && !cancelTask.isPending && !reopenTask.isPending}
        title={title}
        footer={
          detail.data !== undefined && canManage ? (
            <div
              data-testid="task-edit-actions"
              className="flex flex-col gap-2 sm:flex-row sm:justify-end"
            >
              {showReload ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setShowReload(false);
                    setFormMessage(null);
                    void detail.refetch();
                  }}
                >
                  Tải lại
                </Button>
              ) : (
                <Button
                  type="submit"
                  form={FORM_ID}
                  loading={updateTask.isPending}
                  className="w-full sm:w-auto"
                >
                  Lưu
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                className="w-full sm:w-auto"
              >
                Đóng
              </Button>
            </div>
          ) : undefined
        }
      >
        {detail.isPending ? (
          <div
            role="group"
            aria-busy="true"
            aria-label="Đang tải đầu việc"
            className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
          />
        ) : detail.isError ? (
          <EmptyState
            icon={ClipboardList}
            message="Không tải được đầu việc."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void detail.refetch();
                }}
              >
                Thử lại
              </Button>
            }
          />
        ) : (
          <div className="space-y-5">
            <Badge tone={knownStatus ? TASK_STATUS_TONE[knownStatus] : "neutral"}>
              {knownStatus ? TASK_STATUS_LABEL[knownStatus] : detail.data.status}
            </Badge>

            {formMessage ? <Alert>{formMessage}</Alert> : null}

            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => void handleSubmit(onSubmit)(event)}
              className="space-y-4"
            >
              <TextField
                label="Tiêu đề đầu việc"
                disabled={!canManage}
                error={formState.errors.title?.message}
                {...register("title")}
              />
              <Textarea label="Mô tả" disabled={!canManage} {...register("description")} />
              <TextField
                label="Số giờ ước tính"
                inputMode="decimal"
                disabled={!canManage}
                error={formState.errors.estimated_hours?.message}
                {...register("estimated_hours")}
              />
              <TextField
                label="Hạn hoàn thành"
                type="datetime-local"
                disabled={!canManage}
                error={formState.errors.due_at?.message}
                {...register("due_at")}
              />
              <Select label="Mức ưu tiên" disabled={!canManage} {...register("priority")}>
                {PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
            </form>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-heading">Người được giao</h3>
              <ul data-testid="task-assignees" className="space-y-2">
                {detail.data.assignees.map((assignee) => {
                  const known = knownAssignmentStatus(assignee.status);
                  return (
                    <li
                      key={assignee.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-heading">
                          {assignee.full_name}
                        </span>
                        <Badge tone={known ? ASSIGNMENT_STATUS_TONE[known] : "neutral"}>
                          {known ? ASSIGNMENT_STATUS_LABEL[known] : assignee.status}
                        </Badge>
                      </div>
                      {canManage ? (
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`Gỡ ${assignee.full_name}`}
                          onClick={() => {
                            setRemoveError(null);
                            setRemoveTarget(assignee);
                          }}
                        >
                          <UserMinus aria-hidden="true" className="size-4" />
                          Gỡ
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {canManage ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<UserPlus aria-hidden="true" className="size-4" />}
                  onClick={() => {
                    setAssigneeError(null);
                    setPickerOpen((open) => !open);
                  }}
                >
                  + Thêm người
                </Button>
              ) : null}

              {pickerOpen ? (
                <div className="space-y-1.5">
                  {technicians.isError ? (
                    <div
                      role="alert"
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-urgent-border bg-urgent-bg p-3 text-sm text-urgent-fg"
                    >
                      <span>Không tải được danh sách kỹ thuật viên.</span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          void technicians.refetch();
                        }}
                      >
                        Thử lại
                      </Button>
                    </div>
                  ) : candidates.length === 0 ? (
                    <p className="text-sm text-muted">Không còn kỹ thuật viên nào để thêm.</p>
                  ) : (
                    <ul
                      data-testid="assignee-candidates"
                      className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line"
                    >
                      {candidates.map((technician) => (
                        <li key={technician.id}>
                          <button
                            type="button"
                            onClick={() => {
                              void handleAddAssignee(technician);
                            }}
                            className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-sidebar-sub"
                          >
                            <span className="text-sm text-body">
                              <span className="font-medium text-heading">
                                {technician.full_name}
                              </span>{" "}
                              · {technician.code}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {assigneeError ? (
                    <p className="text-xs font-medium text-urgent-fg">{assigneeError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {canManage ? (
              <Button
                type="button"
                variant="secondary"
                icon={<Ban aria-hidden="true" className="size-4" />}
                className="border-urgent-border text-urgent-fg hover:bg-urgent-bg"
                onClick={() => {
                  setCancelError(null);
                  setCancelOpen(true);
                }}
              >
                Huỷ đầu việc
              </Button>
            ) : canReopen ? (
              <Button
                type="button"
                variant="secondary"
                icon={<RotateCcw aria-hidden="true" className="size-4" />}
                className="border-urgent-border text-urgent-fg hover:bg-urgent-bg"
                onClick={() => {
                  setReopenError(null);
                  setReopenOpen(true);
                }}
              >
                Mở lại
              </Button>
            ) : null}
          </div>
        )}
      </Sheet>

      {detail.data !== undefined ? (
        <ReopenTaskSheet
          open={reopenOpen}
          onClose={() => {
            setReopenOpen(false);
            setReopenStale(false);
          }}
          taskCode={detail.data.code}
          loading={reopenTask.isPending}
          error={reopenError}
          staleVersion={reopenStale}
          onReload={() => {
            setReopenStale(false);
            void detail.refetch();
          }}
          onConfirm={submitReopen}
        />
      ) : null}

      {detail.data !== undefined ? (
        <CancelTaskSheet
          open={cancelOpen}
          onClose={() => {
            setCancelOpen(false);
            setCancelStale(false);
          }}
          taskCode={detail.data.code}
          loading={cancelTask.isPending}
          error={cancelError}
          staleVersion={cancelStale}
          onReload={() => {
            setCancelStale(false);
            void detail.refetch();
          }}
          onConfirm={submitCancel}
        />
      ) : null}

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => {
          setRemoveTarget(null);
        }}
        title="Gỡ người được giao"
        message={`Gỡ ${removeTarget?.full_name ?? ""} khỏi đầu việc? Không thể hoàn tác.`}
        confirmLabel="Gỡ"
        loading={removeAssignee.isPending}
        error={removeError}
        onConfirm={() => {
          void confirmRemove();
        }}
      />
    </>
  );
}
