import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type ProductServiceGroup = components["schemas"]["ProductServiceGroupOut"];
export type ProductServiceGroupCreateBody = components["schemas"]["ProductServiceGroupCreate"];
export type ProductServiceGroupUpdateBody = components["schemas"]["ProductServiceGroupUpdate"];

export interface ProductServiceGroupFilters {
  q: string;
  is_active: "" | "true" | "false";
  limit: number;
  offset: number;
}

export const PRODUCT_SERVICE_GROUPS_KEY = "product-service-groups";

/** Paginated, searched, filtered list — kept while the next page loads (no flash back to skeleton). */
export function useProductServiceGroups(filters: ProductServiceGroupFilters) {
  return useQuery({
    queryKey: [PRODUCT_SERVICE_GROUPS_KEY, filters],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/product-service-groups", {
        params: {
          query: {
            q: filters.q || undefined,
            is_active: filters.is_active === "" ? undefined : filters.is_active === "true",
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

/** M16-08: ô chọn "Phòng phụ trách" trên đơn — luôn chỉ hiện nhóm đang hoạt động, không phân trang. */
export function useActiveProductServiceGroups() {
  return useQuery({
    queryKey: [PRODUCT_SERVICE_GROUPS_KEY, "active"],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/product-service-groups", {
        params: { query: { is_active: true, limit: 100, offset: 0 } },
      });
      if (!data) throw toApiError(response, error);
      return data.items;
    },
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [PRODUCT_SERVICE_GROUPS_KEY] });
  };
}

export function useCreateProductServiceGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: ProductServiceGroupCreateBody) => {
      const { data, error, response } = await api.POST("/api/v1/product-service-groups", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateProductServiceGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ProductServiceGroupUpdateBody }) => {
      const { data, error, response } = await api.PATCH(
        "/api/v1/product-service-groups/{group_id}",
        {
          params: { path: { group_id: id } },
          body,
        },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

function versionCommand(
  path:
    | "/api/v1/product-service-groups/{group_id}/deactivate"
    | "/api/v1/product-service-groups/{group_id}/activate",
) {
  return async ({ id, version }: { id: string; version: number }) => {
    const { data, error, response } = await api.POST(path, {
      params: { path: { group_id: id } },
      body: { version },
    });
    if (!data) throw toApiError(response, error);
    return data;
  };
}

export function useDeactivateProductServiceGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: versionCommand("/api/v1/product-service-groups/{group_id}/deactivate"),
    onSuccess: invalidate,
  });
}

export function useActivateProductServiceGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: versionCommand("/api/v1/product-service-groups/{group_id}/activate"),
    onSuccess: invalidate,
  });
}
