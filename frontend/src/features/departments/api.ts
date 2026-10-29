import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type Department = components["schemas"]["DepartmentOut"];

export interface DepartmentFilters {
  q: string;
  is_active: "" | "true" | "false";
  limit: number;
  offset: number;
}

const DEPARTMENTS_KEY = "departments";

/** Paginated, searched, filtered list — kept while the next page loads (no flash back to skeleton). */
export function useDepartments(filters: DepartmentFilters) {
  return useQuery({
    queryKey: [DEPARTMENTS_KEY, filters],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/departments", {
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

/** M17-02b: active departments for the employee form's picker (max page — a handful of rows). */
export function useActiveDepartments(enabled = true) {
  return useQuery({
    queryKey: [DEPARTMENTS_KEY, "active"],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/departments", {
        params: { query: { is_active: true, limit: 100 } },
      });
      if (!data) throw toApiError(response, error);
      return data.items;
    },
    enabled,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [DEPARTMENTS_KEY] });
  };
}

export function useCreateDepartment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error, response } = await api.POST("/api/v1/departments", {
        body: { name },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRenameDepartment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, name, version }: { id: string; name: string; version: number }) => {
      const { data, error, response } = await api.PATCH("/api/v1/departments/{department_id}", {
        params: { path: { department_id: id } },
        body: { name, version },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** `active=false` → POST …/deactivate, `true` → POST …/activate (no `PATCH is_active`). */
export function useSetDepartmentActive() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ department, active }: { department: Department; active: boolean }) => {
      const path = active
        ? "/api/v1/departments/{department_id}/activate"
        : "/api/v1/departments/{department_id}/deactivate";
      const { data, error, response } = await api.POST(path, {
        params: { path: { department_id: department.id } },
        body: { version: department.version },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}
