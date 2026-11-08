import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";
import { CUSTOMER_POTENTIAL_KEY } from "../orders/api";

export type CareCall = components["schemas"]["CareCallOut"];
export type CareCallCreateBody = components["schemas"]["CareCallCreate"];

export const CARE_CALLS_KEY = "customer-care-calls";

export interface CareCallFilters {
  q: string;
  dateFrom: string;
  dateTo: string;
  callerId: string;
  limit: number;
  offset: number;
}

/** AC-CUS-075/076: danh sách cuộc gọi (mới nhất trước, M27-01a) — giữ trang cũ khi đang tải trang mới. */
export function useCareCalls(filters: CareCallFilters, enabled: boolean) {
  return useQuery({
    queryKey: [CARE_CALLS_KEY, filters],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/customer-care-calls", {
        params: {
          query: {
            q: filters.q || undefined,
            from: filters.dateFrom || undefined,
            to: filters.dateTo || undefined,
            caller_id: filters.callerId || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
        },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

/** AC-CUS-071: ghi cuộc gọi; yêu cầu của KH thành tiềm năng của khách nên khối tiềm năng ở đơn cũng tải lại. */
export function useRecordCareCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CareCallCreateBody) => {
      const { data, error, response } = await api.POST("/api/v1/customer-care-calls", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CARE_CALLS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [CUSTOMER_POTENTIAL_KEY] });
    },
  });
}
