import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type KpiSalesRow = components["schemas"]["KpiSalesRowOut"];
export type KpiSalesTotals = components["schemas"]["KpiSalesTotalsOut"];

export interface KpiSalesFilters {
  month: string;
  departmentId: string;
  groupId: string;
  employeeId: string;
  employeeName: string;
}

function reportQuery(filters: KpiSalesFilters) {
  return {
    month: filters.month,
    department_id: filters.departmentId || undefined,
    group_id: filters.groupId || undefined,
    employee_id: filters.employeeId || undefined,
  };
}

/** M21-02a `GET /api/v1/reports/kpi-sales`. */
export function useKpiSalesReport(filters: KpiSalesFilters, { enabled = true } = {}) {
  const query = reportQuery(filters);
  return useQuery({
    enabled,
    queryKey: ["kpi-sales-report", query],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/reports/kpi-sales", {
        params: { query },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** M21-02a `GET /api/v1/me/kpi-sales` — chỉ số liệu của chính người gọi. */
export function useMyKpiSales(month: string) {
  return useQuery({
    queryKey: ["my-kpi-sales", month],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/me/kpi-sales", {
        params: { query: { month } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-RPT-093: trình duyệt tải trực tiếp URL này (session cookie có sẵn), như các báo cáo khác. */
export function kpiSalesExportUrl(filters: KpiSalesFilters): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(reportQuery(filters))) {
    if (value) params.set(key, value);
  }
  return `${apiPrefix}/api/v1/reports/kpi-sales/export?${params.toString()}`;
}
