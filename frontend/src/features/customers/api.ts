import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { resolveBasePath } from "../../lib/basePath";
import { toApiError } from "../auth/errors";
import type { CustomerType } from "./schemas";

export type Customer = components["schemas"]["CustomerOut"];
export type CustomerWritten = components["schemas"]["CustomerWritten"];
export type CustomerCreateBody = components["schemas"]["CustomerCreate"];
export type CustomerUpdateBody = components["schemas"]["CustomerUpdate"];

export interface CustomerFilters {
  q: string;
  type: CustomerType | "";
  limit: number;
  offset: number;
}

export const CUSTOMERS_KEY = "customers";

/** AC-CUS-037 (M20-05): trình duyệt tải trực tiếp URL này (session cookie), như `kpiExportUrl`.
 * Cùng bộ lọc với danh sách nhưng không phân trang. */
export function customersExportUrl(filters: Pick<CustomerFilters, "q" | "type">): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.type) params.set("type", filters.type);
  const query = params.toString();
  return `${apiPrefix}/api/v1/customers/export${query ? `?${query}` : ""}`;
}

/** Paginated, searched, filtered list — kept while the next page loads (no flash back to Skeleton).
 * `enabled` (default true) lets a caller like the order form's customer picker skip fetching while
 * "Khách lẻ" mode hides the search box entirely. */
export function useCustomers(filters: CustomerFilters, enabled = true) {
  return useQuery({
    queryKey: [CUSTOMERS_KEY, filters],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/customers", {
        params: {
          query: {
            q: filters.q || undefined,
            type: filters.type || undefined,
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

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
  };
}

export function useCreateCustomer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: CustomerCreateBody) => {
      const { data, error, response } = await api.POST("/api/v1/customers", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCustomer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: CustomerUpdateBody }) => {
      const { data, error, response } = await api.PATCH("/api/v1/customers/{customer_id}", {
        params: { path: { customer_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export type { CustomerType };
