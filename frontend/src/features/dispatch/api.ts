import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";
import { ME_KEY } from "../me/api";
import { ORDER_KEY, ORDER_LIST_KEY, type Order } from "../orders/api";

export type TaskCreateBody = components["schemas"]["TaskCreate"];
export type TaskDetail = components["schemas"]["TaskDetail"];
export type TaskSummary = components["schemas"]["TaskSummary"];

export const DISPATCH_QUEUE_KEY = "dispatch-queue";
export const ORDER_TASKS_KEY = "order-tasks";

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
