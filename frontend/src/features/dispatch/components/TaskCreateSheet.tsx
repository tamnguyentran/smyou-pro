import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, MapPin, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { formatDate, formatPhone, mapHref } from "../../../lib/format";
import { ApiError } from "../../auth/errors";
import { useOrder } from "../../orders/api";
import { PRIORITY_LABELS, PRIORITY_ORDER } from "../../orders/schemas";
import { DISPATCH_QUEUE_KEY, useActiveTechnicians, useCreateTask, useSuggestedHours } from "../api";
import {
  hoursLabel,
  parseHours,
  priorityOrDefault,
  taskCreateSchema,
  toOffsetIso,
  type TaskCreateFormValues,
} from "../schemas";
import { AssigneePicker } from "./AssigneePicker";

const GENERIC_ERROR = "Không tạo được đầu việc. Vui lòng thử lại.";

/** Ba trường panel thật sự cần — nhận được cả `OrderSummary` (hàng đợi điều phối, M4-01b) và
 * `OrderDetail` (tab "Đầu việc" của trang chi tiết đơn, M4-01c; `OrderDetail` không có
 * `created_by_name` nên không gán được vào `OrderSummary`). */
export interface TaskCreateOrder {
  id: string;
  code: string;
  priority: string;
}

/** AC-DSP-019…026: panel tạo đầu việc (bottom sheet mobile / modal desktop). Chỉ hiện nội dung
 * khi đã có chi tiết đơn + danh sách KTV: `version` để gửi lệnh và người được giao đều bắt buộc. */
const FORM_ID = "task-create-form";

export function TaskCreateSheet({
  order,
  onClose,
}: {
  order: TaskCreateOrder;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useOrder(order.id);
  const technicians = useActiveTechnicians(true);
  const createTask = useCreateTask();
  const suggestedHours = useSuggestedHours(detail.data);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [showReload, setShowReload] = useState(false);
  const [hoursTouched, setHoursTouched] = useState(false);
  const ready = detail.data !== undefined && !technicians.isPending;

  const { register, handleSubmit, formState, setValue, setFocus, control } =
    useForm<TaskCreateFormValues>({
      resolver: zodResolver(taskCreateSchema) as Resolver<TaskCreateFormValues>,
      defaultValues: {
        title: "",
        description: "",
        estimated_hours: "",
        due_at: "",
        priority: priorityOrDefault(order.priority),
        assignee_ids: [],
      },
    });
  const assigneeIds = useWatch({ control, name: "assignee_ids" });

  useEffect(() => {
    if (ready) setFocus("title");
  }, [ready, setFocus]);

  // AC-DSP-020: gợi ý chỉ điền lần đầu — khi Quản lý kỹ thuật đã sửa thì không ghi đè.
  useEffect(() => {
    if (suggestedHours === null || hoursTouched) return;
    setValue("estimated_hours", hoursLabel(suggestedHours));
  }, [suggestedHours, hoursTouched, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    // "Tải lại" (AC-DSP-025) nạp lại đơn: nếu lần nạp đó còn đang bay thì chờ xong để gửi
    // đúng `version` mới, không bao giờ gửi lại version đã bị server từ chối.
    const current = detail.isFetching ? (await detail.refetch()).data : detail.data;
    if (current === undefined) return;
    setFormMessage(null);
    setShowReload(false);
    try {
      const task = await createTask.mutateAsync({
        orderId: current.id,
        body: {
          version: current.version,
          title: values.title,
          description: values.description ? values.description : null,
          estimated_hours: parseHours(values.estimated_hours),
          due_at: toOffsetIso(values.due_at),
          priority: values.priority,
          assignee_ids: values.assignee_ids,
        },
      });
      toast(
        `Đã tạo đầu việc ${task.code} và giao cho ${String(values.assignee_ids.length)} kỹ thuật viên.`,
      );
      onClose();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormMessage(GENERIC_ERROR);
        return;
      }
      setFormMessage(error.problem.detail ?? GENERIC_ERROR);
      if (error.problem.code === "STALE_VERSION") setShowReload(true);
      // Đơn đã rời trạng thái điều phối được: hàng đợi hiện tại đã lạc hậu.
      if (error.problem.guard === "order_in_dispatchable_state") {
        void queryClient.invalidateQueries({ queryKey: [DISPATCH_QUEUE_KEY] });
      }
    }
  });

  return (
    <Sheet
      open
      onClose={onClose}
      dismissible={!createTask.isPending}
      title={ready ? `Tạo đầu việc — ${order.code}` : "Tạo đầu việc"}
      footer={
        ready ? (
          <div
            data-testid="task-create-actions"
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
                loading={createTask.isPending}
                className="w-full sm:w-auto"
              >
                Tạo đầu việc
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
      {!ready ? (
        <div
          role="group"
          aria-busy="true"
          aria-label="Đang tải thông tin đơn"
          className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
        />
      ) : (
        <form
          id={FORM_ID}
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="space-y-4"
        >
          <div className="space-y-2 rounded-xl bg-sidebar-sub p-3 text-sm">
            <p className="font-semibold text-heading">{detail.data.customer_name ?? "Khách lẻ"}</p>
            {detail.data.customer_phone ? (
              <a
                href={`tel:${detail.data.customer_phone}`}
                className="inline-flex min-h-11 items-center gap-2 text-brand underline-offset-2 hover:underline"
              >
                <Phone aria-hidden="true" className="size-4" />
                {formatPhone(detail.data.customer_phone)}
              </a>
            ) : null}
            {detail.data.service_address ? (
              <a
                href={mapHref(detail.data.service_address)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center gap-2 text-brand underline-offset-2 hover:underline"
              >
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                {detail.data.service_address}
              </a>
            ) : null}
            {detail.data.work_description ? (
              <p className="text-body">{detail.data.work_description}</p>
            ) : null}
            {detail.data.requested_date ? (
              <p className="flex items-center gap-2 text-body">
                <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
                {formatDate(detail.data.requested_date)}
              </p>
            ) : null}
          </div>

          {formMessage ? <Alert>{formMessage}</Alert> : null}

          <TextField
            label="Tiêu đề đầu việc"
            placeholder="Vd: Lắp đặt 4 camera tầng 1"
            error={formState.errors.title?.message}
            {...register("title")}
          />
          <Textarea label="Mô tả" {...register("description")} />
          <TextField
            label="Số giờ ước tính"
            inputMode="decimal"
            hint={
              suggestedHours === null
                ? undefined
                : `Gợi ý ${hoursLabel(suggestedHours)} giờ từ dịch vụ trong đơn.`
            }
            error={formState.errors.estimated_hours?.message}
            {...register("estimated_hours", {
              onChange: () => {
                setHoursTouched(true);
              },
            })}
          />
          <TextField
            label="Hạn hoàn thành"
            type="datetime-local"
            error={formState.errors.due_at?.message}
            {...register("due_at")}
          />
          <Select label="Mức ưu tiên" {...register("priority")}>
            {PRIORITY_ORDER.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
          <AssigneePicker
            technicians={technicians.data ?? []}
            loadError={technicians.isError}
            onRetry={() => {
              void technicians.refetch();
            }}
            selected={assigneeIds}
            error={formState.errors.assignee_ids?.message}
            onToggle={(id) => {
              setValue(
                "assignee_ids",
                assigneeIds.includes(id)
                  ? assigneeIds.filter((current) => current !== id)
                  : [...assigneeIds, id],
                { shouldValidate: formState.isSubmitted },
              );
            }}
          />
        </form>
      )}
    </Sheet>
  );
}
