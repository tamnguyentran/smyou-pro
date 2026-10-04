import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";
import { ME_KEY } from "../me/api";
import { ORDER_KEY, ORDER_LIST_KEY, type Order } from "../orders/api";
import type { Priority } from "../orders/schemas";
import type { TaskStatus } from "./taskStatus";

export type TaskBoardItem = components["schemas"]["TaskBoardItem"];
export type EmployeeWorkload = components["schemas"]["EmployeeWorkloadItem"];
export type TaskCreateBody = components["schemas"]["TaskCreate"];
export type TaskDetail = components["schemas"]["TaskDetail"];
export type TaskSummary = components["schemas"]["TaskSummary"];
export type TaskAssignee = components["schemas"]["TaskAssigneeOut"];
export type TaskUpdateBody = components["schemas"]["TaskUpdate"];
export type TaskAddAssigneeBody = components["schemas"]["TaskAddAssignee"];
export type TaskAssigneeRemoveBody = components["schemas"]["TaskAssigneeRemove"];
export type TaskCancelBody = components["schemas"]["TaskCancel"];

export const DISPATCH_QUEUE_KEY = "dispatch-queue";
export const ORDER_TASKS_KEY = "order-tasks";
export const TASK_KEY = "task";
export const TASK_BOARD_KEY = "task-board";
export const WORKLOAD_KEY = "dispatch-workload";

export interface TaskBoardFilters {
  status: TaskStatus | "";
  priority: Priority | "";
  assigneeId: string;
  dueFrom: string;
  dueTo: string;
}

/** AC-DSP-082…091: bảng đầu việc toàn công ty (M4-03b) — `GET /api/v1/tasks` của M4-03a. */
export function useTaskBoard(filters: TaskBoardFilters, { enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: [TASK_BOARD_KEY, filters],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/tasks", {
        params: {
          query: {
            status: filters.status || undefined,
            priority: filters.priority || undefined,
            assignee_id: filters.assigneeId || undefined,
            due_from: filters.dueFrom || undefined,
            due_to: filters.dueTo || undefined,
          },
        },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

/** AC-DSP-101…105: tải việc theo từng KTV đang hoạt động (M4-04) — `GET /api/v1/tasks/workload`. */
export function useWorkload(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: [WORKLOAD_KEY],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/tasks/workload", {});
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-DSP-028: danh sách đầu việc của 1 đơn (capability `order.read` — Q61). Chỉ gọi khi tab
 * "Đầu việc" được mở: `OrderTasksTab` chỉ được render khi tab đó đang chọn. */
export function useOrderTasks(orderId: string) {
  return useQuery({
    queryKey: [ORDER_TASKS_KEY, orderId],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/orders/{order_id}/tasks", {
        params: { path: { order_id: orderId } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-DSP-015: hàng đợi điều phối — chỉ đơn `PENDING_DISPATCH`, thứ tự do server quyết (`sort=dispatch`). */
export function useDispatchQueue({
  limit,
  offset,
  enabled,
}: {
  limit: number;
  offset: number;
  /** false khi người dùng không có `task.manage`: trang trả 403 và không gọi API (AC-DSP-018). */
  enabled: boolean;
}) {
  return useQuery({
    queryKey: [DISPATCH_QUEUE_KEY, limit, offset],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/orders", {
        params: { query: { status: "PENDING_DISPATCH", sort: "dispatch", limit, offset } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

/** AC-DSP-021: chỉ kỹ thuật viên đang hoạt động được giao việc (server lọc, không lọc ở client). */
export function useActiveTechnicians(enabled: boolean) {
  return useQuery({
    queryKey: ["dispatch-technicians"],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/employees", {
        params: { query: { role: "TECHNICIAN", is_active: true, limit: 100 } },
      });
      if (!data) throw toApiError(response, error);
      return data.items;
    },
  });
}

/** AC-DSP-020: gợi ý số giờ = Σ(`default_estimated_hours` × số lượng) của các dòng dịch vụ.
 * Tiện ích, không bắt buộc: thiếu dữ liệu hoặc lỗi gọi `GET /services/{id}` → không gợi ý. */
export function useSuggestedHours(order: Order | undefined): number | null {
  const serviceIds = [
    ...new Set(
      (order?.lines ?? [])
        .filter((line) => line.item_type === "SERVICE" && line.service_id !== null)
        .map((line) => line.service_id as string),
    ),
  ];
  const services = useQueries({
    queries: serviceIds.map((serviceId) => ({
      queryKey: ["service", serviceId],
      queryFn: async () => {
        const { data, error, response } = await api.GET("/api/v1/services/{service_id}", {
          params: { path: { service_id: serviceId } },
        });
        if (!data) throw toApiError(response, error);
        return data;
      },
    })),
  });
  if (order === undefined || serviceIds.length === 0) return null;
  if (services.some((query) => query.data === undefined)) return null;

  let total = 0;
  for (const line of order.lines) {
    if (line.item_type !== "SERVICE" || line.service_id === null) continue;
    const hours = services.find((query) => query.data?.id === line.service_id)?.data
      ?.default_estimated_hours;
    if (hours === null || hours === undefined) continue;
    total += Number(hours) * Number(line.quantity);
  }
  return total > 0 ? total : null;
}

/** AC-DSP-022: tạo đầu việc + giao nhiều KTV. Đơn rời hàng đợi (đã `IN_PROGRESS`) và badge
 * `pending_dispatch_count` giảm → làm mới cả hàng đợi, đơn, danh sách đầu việc và `GET /me`. */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, body }: { orderId: string; body: TaskCreateBody }) => {
      const { data, error, response } = await api.POST("/api/v1/orders/{order_id}/tasks", {
        params: { path: { order_id: orderId } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: [DISPATCH_QUEUE_KEY] });
      void queryClient.invalidateQueries({ queryKey: [ORDER_LIST_KEY] });
      void queryClient.invalidateQueries({ queryKey: [ORDER_KEY, task.order_id] });
      void queryClient.invalidateQueries({ queryKey: [ORDER_TASKS_KEY, task.order_id] });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

/** AC-DSP-058: chi tiết 1 đầu việc cho `TaskEditSheet` — `order_version` của phản hồi là
 * "version" thật sự phải gửi lại ở mọi lệnh sửa/thêm/gỡ/huỷ (order là aggregate root, task không
 * có cột version riêng — xem `backend/app/modules/dispatch/service.py`). */
export function useTask(orderId: string, taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: [TASK_KEY, taskId],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/orders/{order_id}/tasks/{task_id}", {
        params: { path: { order_id: orderId, task_id: taskId } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-DSP-059: sửa title/description/estimated_hours/due_at/priority. */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      taskId,
      body,
    }: {
      orderId: string;
      taskId: string;
      body: TaskUpdateBody;
    }) => {
      const { data, error, response } = await api.PATCH(
        "/api/v1/orders/{order_id}/tasks/{task_id}",
        { params: { path: { order_id: orderId, task_id: taskId } }, body },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: (_task, { orderId, taskId }) => {
      void queryClient.invalidateQueries({ queryKey: [ORDER_TASKS_KEY, orderId] });
      void queryClient.invalidateQueries({ queryKey: [ORDER_KEY, orderId] });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      void queryClient.invalidateQueries({ queryKey: [TASK_KEY, taskId] });
    },
  });
}

/** AC-DSP-062: thêm 1 kỹ thuật viên đang hoạt động, chưa có trong task. */
export function useAddAssignee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      taskId,
      body,
    }: {
      orderId: string;
      taskId: string;
      body: TaskAddAssigneeBody;
    }) => {
      const { data, error, response } = await api.POST(
        "/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
        { params: { path: { order_id: orderId, task_id: taskId } }, body },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: (_task, { orderId, taskId }) => {
      void queryClient.invalidateQueries({ queryKey: [ORDER_TASKS_KEY, orderId] });
      void queryClient.invalidateQueries({ queryKey: [ORDER_KEY, orderId] });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      void queryClient.invalidateQueries({ queryKey: [TASK_KEY, taskId] });
    },
  });
}

/** AC-DSP-064: gỡ 1 người được giao (server vẫn là nơi chặn thật — client chỉ lọc hiển thị). */
export function useRemoveAssignee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      taskId,
      assignmentId,
      body,
    }: {
      orderId: string;
      taskId: string;
      assignmentId: string;
      body: TaskAssigneeRemoveBody;
    }) => {
      const { data, error, response } = await api.POST(
        "/api/v1/orders/{order_id}/tasks/{task_id}/assignees/{assignment_id}/remove",
        {
          params: { path: { order_id: orderId, task_id: taskId, assignment_id: assignmentId } },
          body,
        },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: (_task, { orderId, taskId }) => {
      void queryClient.invalidateQueries({ queryKey: [ORDER_TASKS_KEY, orderId] });
      void queryClient.invalidateQueries({ queryKey: [ORDER_KEY, orderId] });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      void queryClient.invalidateQueries({ queryKey: [TASK_KEY, taskId] });
    },
  });
}

/** AC-DSP-067: huỷ đầu việc — không đảo ngược, gỡ hết người đang hoạt động ở server. */
export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      taskId,
      body,
    }: {
      orderId: string;
      taskId: string;
      body: TaskCancelBody;
    }) => {
      const { data, error, response } = await api.POST(
        "/api/v1/orders/{order_id}/tasks/{task_id}/cancel",
        { params: { path: { order_id: orderId, task_id: taskId } }, body },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: (_task, { orderId, taskId }) => {
      void queryClient.invalidateQueries({ queryKey: [ORDER_TASKS_KEY, orderId] });
      void queryClient.invalidateQueries({ queryKey: [ORDER_KEY, orderId] });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      void queryClient.invalidateQueries({ queryKey: [TASK_KEY, taskId] });
    },
  });
}
