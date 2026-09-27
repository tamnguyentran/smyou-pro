import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { resolveBasePath } from "../../lib/basePath";
import { toApiError } from "../auth/errors";
import type { Category, Unit } from "./schemas";

export type Product = components["schemas"]["ProductOut"];
export type ProductCreateBody = components["schemas"]["ProductCreate"];
export type ProductUpdateBody = components["schemas"]["ProductUpdate"];

export interface ProductFilters {
  q: string;
  category: Category | "";
  is_active: "" | "true" | "false";
  limit: number;
  offset: number;
}

export const PRODUCTS_KEY = "products";

/** Full URL of a product's image (served by GET /api/v1/attachments/{id}, cookie-auth, inline). */
export function productImageUrl(attachmentId: string): string {
  return `${resolveBasePath(import.meta.env.BASE_URL).apiPrefix}/api/v1/attachments/${attachmentId}`;
}

/** Paginated, searched, filtered list — kept while the next page loads (no flash back to Skeleton). */
export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: [PRODUCTS_KEY, filters],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/products", {
        params: {
          query: {
            q: filters.q || undefined,
            category: filters.category || undefined,
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

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
  };
}

export function useCreateProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: ProductCreateBody) => {
      const { data, error, response } = await api.POST("/api/v1/products", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ProductUpdateBody }) => {
      const { data, error, response } = await api.PATCH("/api/v1/products/{product_id}", {
        params: { path: { product_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

function versionCommand(
  path: "/api/v1/products/{product_id}/deactivate" | "/api/v1/products/{product_id}/activate",
) {
  return async ({ id, version }: { id: string; version: number }) => {
    const { data, error, response } = await api.POST(path, {
      params: { path: { product_id: id } },
      body: { version },
    });
    if (!data) throw toApiError(response, error);
    return data;
  };
}

export function useDeactivateProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: versionCommand("/api/v1/products/{product_id}/deactivate"),
    onSuccess: invalidate,
  });
}

export function useActivateProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: versionCommand("/api/v1/products/{product_id}/activate"),
    onSuccess: invalidate,
  });
}

export type { Category, Unit };
