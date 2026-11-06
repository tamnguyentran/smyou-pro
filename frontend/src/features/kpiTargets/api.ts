import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type KpiTargetRow = components["schemas"]["KpiTargetRowOut"];

export interface KpiTargetFilters {
  month: string;
  department_id: string;
  q: string;
  limit: number;
  offset: number;
}

const KPI_TARGETS_KEY = "kpi-targets";

/** One page of rows (one per employee) for the month (M21-01a, paged M21-01c) — kept while a department/search filter loads,
 * but never across a month change: those rows' `version` belongs to the old month, so editing
 * them would PUT/DELETE the new month with stale data. */
export function useKpiTargets(filters: KpiTargetFilters) {
  return useQuery({
    queryKey: [KPI_TARGETS_KEY, filters] as const,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/kpi-targets", {
        params: {
          query: {
            month: filters.month,
            department_id: filters.department_id || undefined,
            q: filters.q || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
        },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1].month === filters.month ? previous : undefined,
    enabled: filters.month !== "",
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [KPI_TARGETS_KEY] });
}

export function useSetKpiTarget() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      row,
      month,
      target,
    }: {
      row: KpiTargetRow;
      month: string;
      target: number;
    }) => {
      const { data, error, response } = await api.PUT("/api/v1/kpi-targets/{employee_id}/{month}", {
        params: { path: { employee_id: row.employee_id, month } },
        body:
          row.version === null
            ? { net_revenue_target: target }
            : { net_revenue_target: target, version: row.version },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    // Also on error: a 409 means someone else changed the row, so reload it (AC-KPI-050).
    onSettled: invalidate,
  });
}

export function useDeleteKpiTarget() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ row, month }: { row: KpiTargetRow; month: string }) => {
      const { error, response } = await api.DELETE("/api/v1/kpi-targets/{employee_id}/{month}", {
        params: { path: { employee_id: row.employee_id, month } },
      });
      if (!response.ok) throw toApiError(response, error);
    },
    onSuccess: invalidate,
  });
}

export function useCopyKpiTargets() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: { from_month: string; to_month: string; overwrite: boolean }) => {
      const { data, error, response } = await api.POST("/api/v1/kpi-targets/copy", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}
