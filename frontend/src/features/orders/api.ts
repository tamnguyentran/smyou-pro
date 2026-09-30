import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type Order = components["schemas"]["OrderDetail"];
export type OrderLine = components["schemas"]["OrderLineOut"];
export type OrderCreateBody = components["schemas"]["OrderCreate"];
export type OrderUpdateBody = components["schemas"]["OrderUpdate"];
export type OrderLineCreateBody = components["schemas"]["OrderLineCreate"];
export type OrderLineUpdateBody = components["schemas"]["OrderLineUpdate"];

export const ORDER_KEY = "order";

/** No order list endpoint yet (M3-03) — this feature only ever loads one order by id. */
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
