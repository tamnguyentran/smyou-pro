import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components, operations } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

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
export type OrderCancelBody = components["schemas"]["OrderCancel"];
export type AuditEventOut = components["schemas"]["AuditEventOut"];

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
export function useOrders(filters: OrderFilters) {
  return useQuery({
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

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: [ORDER_KEY, orderId],
    enabled: orderId !== undefined,
    queryFn: async () => {
      if (orderId === undefined) throw new Error("useOrder called without an id");
      const { data, error, response } = await api.GET("/api/v1/orders/{order_id}", {
        params: { path: { order_id: orderId } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

function useSetOrder() {
  const queryClient = useQueryClient();
  return (order: Order) => {
    queryClient.setQueryData([ORDER_KEY, order.id], order);
  };
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
