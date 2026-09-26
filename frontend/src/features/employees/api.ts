import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type Employee = components["schemas"]["EmployeeOut"];
export type EmployeeCreateBody = components["schemas"]["EmployeeCreate"];
export type EmployeeUpdateBody = components["schemas"]["EmployeeUpdate"];
export type EmployeeWithPassword = components["schemas"]["EmployeeWithPassword"];
export type Role = "MANAGER" | "SALE" | "TECH_LEAD" | "TECHNICIAN";

export interface EmployeeFilters {
  q: string;
  role: Role | "";
  is_active: "" | "true" | "false";
  limit: number;
  offset: number;
}

export const EMPLOYEES_KEY = "employees";

/** Paginated, searched, filtered list — kept while the next page loads (no flash back to Skeleton). */
export function useEmployees(filters: EmployeeFilters) {
  return useQuery({
    queryKey: [EMPLOYEES_KEY, filters],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/employees", {
        params: {
          query: {
            q: filters.q || undefined,
            role: filters.role || undefined,
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
    void queryClient.invalidateQueries({ queryKey: [EMPLOYEES_KEY] });
  };
}

export function useCreateEmployee() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: EmployeeCreateBody) => {
      const { data, error, response } = await api.POST("/api/v1/employees", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateEmployee() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: EmployeeUpdateBody }) => {
      const { data, error, response } = await api.PATCH("/api/v1/employees/{employee_id}", {
        params: { path: { employee_id: id } },
        body,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useSetRoles() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, version, roles }: { id: string; version: number; roles: Role[] }) => {
      const { data, error, response } = await api.POST("/api/v1/employees/{employee_id}/roles", {
        params: { path: { employee_id: id } },
        body: { version, roles },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

function versionCommand(
  path: "/api/v1/employees/{employee_id}/deactivate" | "/api/v1/employees/{employee_id}/activate",
) {
  return async ({ id, version }: { id: string; version: number }) => {
    const { data, error, response } = await api.POST(path, {
      params: { path: { employee_id: id } },
      body: { version },
    });
    if (!data) throw toApiError(response, error);
    return data;
  };
}

export function useDeactivateEmployee() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: versionCommand("/api/v1/employees/{employee_id}/deactivate"),
    onSuccess: invalidate,
  });
}

export function useActivateEmployee() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: versionCommand("/api/v1/employees/{employee_id}/activate"),
    onSuccess: invalidate,
  });
}

export function useResetPassword() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data, error, response } = await api.POST(
        "/api/v1/employees/{employee_id}/reset-password",
        { params: { path: { employee_id: id } }, body: { version } },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}
