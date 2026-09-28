import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";
import type { Category, Unit } from "./schemas";

export type Service = components["schemas"]["ServiceOut"];
export type ServiceCreateBody = components["schemas"]["ServiceCreate"];
export type ServiceUpdateBody = components["schemas"]["ServiceUpdate"];

export interface ServiceFilters {
  q: string;
  category: Category | "";
  is_active: "" | "true" | "false";
  limit: number;
  offset: number;
}

export const SERVICES_KEY = "services";

/** Paginated, searched, filtered list — kept while the next page loads (no flash back to Skeleton). */
export function useServices(filters: ServiceFilters) {
  return useQuery({
    queryKey: [SERVICES_KEY, filters],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/services", {
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
    void queryClient.invalidateQueries({ queryKey: [SERVICES_KEY] });
  };
}

export function useCreateService() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: ServiceCreateBody) => {
      const { data, error, response } = await api.POST("/api/v1/services", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateService() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ServiceUpdateBody }) => {
      const { data, error, response } = await api.PATCH("/api/v1/services/{service_id}", {
        params: { path: { service_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

function versionCommand(
  path: "/api/v1/services/{service_id}/deactivate" | "/api/v1/services/{service_id}/activate",
) {
  return async ({ id, version }: { id: string; version: number }) => {
    const { data, error, response } = await api.POST(path, {
      params: { path: { service_id: id } },
      body: { version },
    });
    if (!data) throw toApiError(response, error);
    return data;
  };
}

export function useDeactivateService() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: versionCommand("/api/v1/services/{service_id}/deactivate"),
    onSuccess: invalidate,
  });
}

export function useActivateService() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: versionCommand("/api/v1/services/{service_id}/activate"),
    onSuccess: invalidate,
  });
}

export type { Category, Unit };
