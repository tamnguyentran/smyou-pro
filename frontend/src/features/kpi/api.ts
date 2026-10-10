import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type KpiReport = components["schemas"]["KpiReportOut"];
export type KpiRow = components["schemas"]["KpiRowOut"];

export interface KpiFilters {
  from: string;
  to: string;
  employeeId: string;
}

export const KPI_REPORT_KEY = "kpi-report";

/** M8-01a `GET /api/v1/kpi/report` — cùng queryKey khi `employeeId` rỗng cho mọi lần gọi không lọc
 * theo KTV, để dropdown (luôn dùng bộ lọc rỗng) và bảng (chưa lọc) chia sẻ 1 lần gọi API. */
export function useKpiReport(filters: KpiFilters, { enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: [KPI_REPORT_KEY, filters.from, filters.to, filters.employeeId || undefined],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/kpi/report", {
        params: {
          query: {
            from: filters.from,
            to: filters.to,
            employee_id: filters.employeeId || undefined,
          },
        },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-KPI-022/024: trình duyệt tải trực tiếp URL này (session cookie có sẵn), không qua fetch+blob. */
export function kpiExportUrl(filters: KpiFilters): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.employeeId) params.set("employee_id", filters.employeeId);
  return `${apiPrefix}/api/v1/kpi/report/export?${params.toString()}`;
}
