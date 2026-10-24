import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type CustomerGift = components["schemas"]["CustomerGiftOut"];
export type CustomerGiftCreateBody = components["schemas"]["CustomerGiftCreate"];
export type CustomerGiftUpdateBody = components["schemas"]["CustomerGiftUpdate"];
export type GiftPhoto = components["schemas"]["GiftPhoto"];

export { attachmentUrl } from "../orders/api";

export const CUSTOMER_GIFTS_KEY = "customer-gifts";
export const CUSTOMER_GIFT_PHOTOS_KEY = "customer-gift-photos";

/** AC-GFT-021: danh sách bản ghi tặng quà của 1 khách hàng — `customer_id` bắt buộc ở API (M16-01a). */
export function useGifts(customerId: string | undefined) {
  return useQuery({
    queryKey: [CUSTOMER_GIFTS_KEY, customerId],
    enabled: customerId !== undefined,
    queryFn: async () => {
      if (customerId === undefined) throw new Error("useGifts called without a customer id");
      const { data, error, response } = await api.GET("/api/v1/customer-gifts", {
        params: { query: { customer_id: customerId, limit: 20, offset: 0 } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

export function useGiftPhotos(giftId: string | undefined) {
  return useQuery({
    queryKey: [CUSTOMER_GIFT_PHOTOS_KEY, giftId],
    enabled: giftId !== undefined,
    queryFn: async () => {
      if (giftId === undefined) throw new Error("useGiftPhotos called without a gift id");
      const { data, error, response } = await api.GET("/api/v1/customer-gifts/{gift_id}/photos", {
        params: { path: { gift_id: giftId } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

function useInvalidate(customerId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [CUSTOMER_GIFTS_KEY, customerId] });
  };
}

export function useCreateGift(customerId: string | undefined) {
  const invalidate = useInvalidate(customerId);
  return useMutation({
    mutationFn: async (body: CustomerGiftCreateBody) => {
      const { data, error, response } = await api.POST("/api/v1/customer-gifts", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateGift(customerId: string | undefined) {
  const invalidate = useInvalidate(customerId);
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: CustomerGiftUpdateBody }) => {
      const { data, error, response } = await api.PATCH("/api/v1/customer-gifts/{gift_id}", {
        params: { path: { gift_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}
