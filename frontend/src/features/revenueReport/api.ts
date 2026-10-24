import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type RevenueRow = components["schemas"]["RevenueRowOut"];
export type RevenueReport = components["schemas"]["RevenueReportOut"];
export type RevenueLine = components["schemas"]["RevenueLineOut"];

export type RevenueStatus = "COMPLETED" | "NOT_COMPLETED";

export interface RevenueFilters {
  from: string;
  to: string;
  customerId: string;
  status: RevenueStatus;
}

export const REVENUE_REPORT_KEY = "revenue-by-customer-report";
export const REVENUE_ORDERS_KEY = "revenue-by-customer-orders";

/** M15-09a `GET /api/v1/reports/revenue-by-customer`. */
export function useRevenueReport(filters: RevenueFilters, { enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: [
      REVENUE_REPORT_KEY,
      filters.from,
      filters.to,
      filters.customerId || undefined,
      filters.status,
    ],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/reports/revenue-by-customer", {
        params: {
          query: {
            from: filters.from,
            to: filters.to,
            customer_id: filters.customerId || undefined,
            status: filters.status,
          },
        },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** M16-06 `GET /api/v1/reports/revenue-by-customer/{customer_id}/lines` — drilldown theo dòng
 * hàng. Truyền đúng 1 trong 2: `sellerId` (1 NV) hoặc `unassigned: true` (nhóm "Chưa gán"). */
export function useCustomerLines(
  customerId: string,
  selector: { sellerId: string } | { unassigned: true },
  filters: Pick<RevenueFilters, "from" | "to" | "status">,
  { enabled = true } = {},
) {
  const sellerId = "sellerId" in selector ? selector.sellerId : undefined;
  const unassigned = "unassigned" in selector;
  return useQuery({
    enabled,
    queryKey: [
      REVENUE_ORDERS_KEY,
      customerId,
      sellerId ?? "unassigned",
      filters.from,
      filters.to,
      filters.status,
    ],
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/v1/reports/revenue-by-customer/{customer_id}/lines",
        {
          params: {
            path: { customer_id: customerId },
            query: {
              from: filters.from,
              to: filters.to,
              status: filters.status,
              seller_id: sellerId,
              unassigned,
            },
          },
        },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-RPT-014: trình duyệt tải trực tiếp URL này (session cookie có sẵn), không qua fetch+blob. */
export function revenueExportUrl(
  filters: Pick<RevenueFilters, "from" | "to" | "status" | "customerId">,
): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    status: filters.status,
  });
  if (filters.customerId) params.set("customer_id", filters.customerId);
  return `${apiPrefix}/api/v1/reports/revenue-by-customer/export?${params.toString()}`;
}
