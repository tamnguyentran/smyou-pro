import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";
import type { RevenueStatus } from "./api";

export type EmployeeRevenueRow = components["schemas"]["EmployeeRevenueRowOut"];
export type EmployeeRevenueReport = components["schemas"]["EmployeeRevenueReportOut"];

export interface EmployeeRevenueFilters {
  from: string;
  to: string;
  employeeId: string;
  status: RevenueStatus;
}

export const EMPLOYEE_REVENUE_REPORT_KEY = "revenue-by-employee-report";
export const EMPLOYEE_REVENUE_ORDERS_KEY = "revenue-by-employee-orders";

/** M15-10a `GET /api/v1/reports/revenue-by-employee`. */
export function useEmployeeRevenueReport(filters: EmployeeRevenueFilters, { enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: [
      EMPLOYEE_REVENUE_REPORT_KEY,
      filters.from,
      filters.to,
      filters.employeeId || undefined,
      filters.status,
    ],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/reports/revenue-by-employee", {
        params: {
          query: {
            from: filters.from,
            to: filters.to,
            employee_id: filters.employeeId || undefined,
            status: filters.status,
          },
        },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** M15-10a `GET /api/v1/reports/revenue-by-employee/{employee_id}/orders` — drilldown cấp 1. */
export function useEmployeeOrders(
  employeeId: string,
  filters: Pick<EmployeeRevenueFilters, "from" | "to" | "status">,
  { enabled = true } = {},
) {
  return useQuery({
    enabled,
    queryKey: [EMPLOYEE_REVENUE_ORDERS_KEY, employeeId, filters.from, filters.to, filters.status],
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/v1/reports/revenue-by-employee/{employee_id}/orders",
        {
          params: {
            path: { employee_id: employeeId },
            query: { from: filters.from, to: filters.to, status: filters.status },
          },
        },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-RPT-033: trình duyệt tải trực tiếp URL này (session cookie có sẵn), không qua fetch+blob. */
export function employeeRevenueExportUrl(
  filters: Pick<EmployeeRevenueFilters, "from" | "to" | "status" | "employeeId">,
): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    status: filters.status,
  });
  if (filters.employeeId) params.set("employee_id", filters.employeeId);
  return `${apiPrefix}/api/v1/reports/revenue-by-employee/export?${params.toString()}`;
}
