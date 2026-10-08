import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components, operations } from "../../lib/api/schema";
import { resolveBasePath } from "../../lib/basePath";
import { toApiError } from "../auth/errors";
import { freshestOrder } from "./orderCache";

export type OrderStatus = NonNullable<
  NonNullable<operations["orders_list"]["parameters"]["query"]>["status"]
>;
export type Order = components["schemas"]["OrderDetail"];
export type OrderLine = components["schemas"]["OrderLineOut"];
export type OrderSummary = components["schemas"]["OrderSummary"];
export type OrderCreateBody = components["schemas"]["OrderCreate"];
export type OrderUpdateBody = components["schemas"]["OrderUpdate"];
export type OrderLineCreateBody = components["schemas"]["OrderLineCreate"];
export type OrderLineUpdateBody = components["schemas"]["OrderLineUpdate"];
export type OrderContactUpdateBody = components["schemas"]["OrderContactUpdate"];
export type OrderCancelBody = components["schemas"]["OrderCancel"];
export type OrderCompleteBody = components["schemas"]["OrderComplete"];
export type OrderReviseBody = components["schemas"]["OrderRevise"];
export type AuditEventOut = components["schemas"]["AuditEventOut"];
export type ConfirmationAttachment = components["schemas"]["ConfirmationAttachment"];

export const ORDER_KEY = "order";
export const ORDER_LIST_KEY = "orders";
export const ORDER_HISTORY_KEY = "order-history";

export interface OrderFilters {
  q: string;
  status: string;
  limit: number;
  offset: number;
}

/** AC-ORD-069: danh sách đơn — tìm theo mã/tên khách/SĐT, lọc theo trạng thái. */
export function useOrders(filters: OrderFilters, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: [ORDER_LIST_KEY, filters],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/orders", {
        params: {
          query: {
            q: filters.q || undefined,
            status: (filters.status || undefined) as OrderStatus | undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
        },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-ORD-067: lịch sử thay đổi trạng thái của đơn (timeline, mới nhất trước). */
export function useOrderHistory(orderId: string | undefined) {
  return useQuery({
    queryKey: [ORDER_HISTORY_KEY, orderId],
    enabled: orderId !== undefined,
    queryFn: async () => {
      if (orderId === undefined) throw new Error("useOrderHistory called without an id");
      const { data, error, response } = await api.GET("/api/v1/orders/{order_id}/history", {
        params: { path: { order_id: orderId }, query: { limit: 50, offset: 0 } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

export const CONFIRMATION_ATTACHMENTS_KEY = "order-confirmation-attachments";

/** AC-CMP-011: ảnh phiếu xác nhận đã tải, mới nhất trước — tab "Tệp đính kèm". */
export function useConfirmationAttachments(orderId: string | undefined) {
  return useQuery({
    queryKey: [CONFIRMATION_ATTACHMENTS_KEY, orderId],
    enabled: orderId !== undefined,
    queryFn: async () => {
      if (orderId === undefined) throw new Error("useConfirmationAttachments called without an id");
      const { data, error, response } = await api.GET(
        "/api/v1/orders/{order_id}/confirmation-attachments",
        { params: { path: { order_id: orderId } } },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

export function attachmentUrl(attachmentId: string): string {
  return `${resolveBasePath(import.meta.env.BASE_URL).apiPrefix}/api/v1/attachments/${attachmentId}`;
}

export function useOrder(orderId: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [ORDER_KEY, orderId],
    enabled: orderId !== undefined,
    queryFn: async () => {
      if (orderId === undefined) throw new Error("useOrder called without an id");
      const { data, error, response } = await api.GET("/api/v1/orders/{order_id}", {
        params: { path: { order_id: orderId } },
      });
      if (!data) throw toApiError(response, error);
      // AC-ORD-119/120: một phản hồi bay song song có thể về sau một lệnh ghi đã tăng `version` —
      // giữ bản mới hơn thay vì để bản chụp cũ này thành dữ liệu của query (M3-07).
      return freshestOrder(queryClient.getQueryData<Order>([ORDER_KEY, orderId]), data);
    },
  });
}

function useSetOrder() {
  const queryClient = useQueryClient();
  return (order: Order) => {
    // AC-ORD-123: cùng bất biến cho phản hồi của mutation, không chỉ cho `GET`.
    queryClient.setQueryData<Order>([ORDER_KEY, order.id], (cached) =>
      freshestOrder(cached, order),
    );
  };
}

/** AC-ORD-154: AWAITING_CONFIRMATION|COMPLETED → REVISION. */
export function useReviseOrder() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrderReviseBody }) => {
      const { data, error, response } = await api.POST("/api/v1/orders/{order_id}/revise", {
        params: { path: { order_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

export function useCreateOrder() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async (body: OrderCreateBody) => {
      const { data, error, response } = await api.POST("/api/v1/orders", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

/** AC-ORD-061: DRAFT → PENDING_DISPATCH. */
export function useSubmitOrder() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data, error, response } = await api.POST("/api/v1/orders/{order_id}/submit", {
        params: { path: { order_id: id } },
        body: { version },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

/** AC-ORD-065: PENDING_DISPATCH → DRAFT. */
export function useRecallOrder() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data, error, response } = await api.POST("/api/v1/orders/{order_id}/recall", {
        params: { path: { order_id: id } },
        body: { version },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

/** AC-ORD-063: DRAFT|PENDING_DISPATCH → CANCELLED. */
export function useCancelOrder() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrderCancelBody }) => {
      const { data, error, response } = await api.POST("/api/v1/orders/{order_id}/cancel", {
        params: { path: { order_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

/** AC-ORD-125: AWAITING_CONFIRMATION → COMPLETED. */
export function useCompleteOrder() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrderCompleteBody }) => {
      const { data, error, response } = await api.POST("/api/v1/orders/{order_id}/complete", {
        params: { path: { order_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

export function useUpdateOrder() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrderUpdateBody }) => {
      const { data, error, response } = await api.PATCH("/api/v1/orders/{order_id}", {
        params: { path: { order_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

export function useAddLine() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrderLineCreateBody }) => {
      const { data, error, response } = await api.POST("/api/v1/orders/{order_id}/lines", {
        params: { path: { order_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

export function useUpdateLine() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({
      id,
      lineId,
      body,
    }: {
      id: string;
      lineId: string;
      body: OrderLineUpdateBody;
    }) => {
      const { data, error, response } = await api.PATCH(
        "/api/v1/orders/{order_id}/lines/{line_id}",
        { params: { path: { order_id: id, line_id: lineId } }, body },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

export function useRemoveLine() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({
      id,
      lineId,
      version,
    }: {
      id: string;
      lineId: string;
      version: number;
    }) => {
      const { data, error, response } = await api.POST(
        "/api/v1/orders/{order_id}/lines/{line_id}/remove",
        { params: { path: { order_id: id, line_id: lineId } }, body: { version } },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

/** AC-ORD-093/096/097: sửa liên hệ sau khi gửi (M3-04a's `order.edit_contact`). */
export function useUpdateContact() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrderContactUpdateBody }) => {
      const { data, error, response } = await api.PATCH("/api/v1/orders/{order_id}/contact", {
        params: { path: { order_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

/** AC-ORD-098: thêm dòng sau khi gửi (M3-04a's `order.edit_lines_after_submit`). */
export function useAddLineAfterSubmit() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrderLineCreateBody }) => {
      const { data, error, response } = await api.POST(
        "/api/v1/orders/{order_id}/lines-after-submit",
        { params: { path: { order_id: id } }, body },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

/** AC-ORD-099: sửa dòng sau khi gửi. */
export function useUpdateLineAfterSubmit() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({
      id,
      lineId,
      body,
    }: {
      id: string;
      lineId: string;
      body: OrderLineUpdateBody;
    }) => {
      const { data, error, response } = await api.PATCH(
        "/api/v1/orders/{order_id}/lines-after-submit/{line_id}",
        { params: { path: { order_id: id, line_id: lineId } }, body },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}

/** AC-ORD-100: xoá dòng sau khi gửi. */
export function useRemoveLineAfterSubmit() {
  const setOrder = useSetOrder();
  return useMutation({
    mutationFn: async ({
      id,
      lineId,
      version,
    }: {
      id: string;
      lineId: string;
      version: number;
    }) => {
      const { data, error, response } = await api.POST(
        "/api/v1/orders/{order_id}/lines-after-submit/{line_id}/remove",
        { params: { path: { order_id: id, line_id: lineId } }, body: { version } },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: setOrder,
  });
}
