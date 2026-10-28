import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type CustomerGiftReportRow = components["schemas"]["CustomerGiftReportRowOut"];
export type CustomerGiftReport = components["schemas"]["CustomerGiftReportOut"];
export type CustomerGiftItem = components["schemas"]["CustomerGiftOut"];

export interface CustomerGiftReportFilters {
  from: string;
  to: string;
  customerId: string;
}

export const CUSTOMER_GIFT_REPORT_KEY = "customer-gift-report";
export const CUSTOMER_GIFT_REPORT_ITEMS_KEY = "customer-gift-report-items";

/** M16-02a `GET /api/v1/reports/customer-gifts`. */
export function useCustomerGiftReport(filters: CustomerGiftReportFilters, { enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: [CUSTOMER_GIFT_REPORT_KEY, filters.from, filters.to, filters.customerId || undefined],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/reports/customer-gifts", {
        params: {
          query: {
            from: filters.from,
            to: filters.to,
            customer_id: filters.customerId || undefined,
          },
        },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** M16-02a `GET /api/v1/reports/customer-gifts/{customer_id}/items` — drilldown. */
export function useCustomerGiftReportItems(
  customerId: string,
  filters: Pick<CustomerGiftReportFilters, "from" | "to">,
  { enabled = true } = {},
) {
  return useQuery({
    enabled,
    queryKey: [CUSTOMER_GIFT_REPORT_ITEMS_KEY, customerId, filters.from, filters.to],
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/v1/reports/customer-gifts/{customer_id}/items",
        {
          params: {
            path: { customer_id: customerId },
            query: { from: filters.from, to: filters.to },
          },
        },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-GFT-042: trình duyệt tải trực tiếp URL này (session cookie có sẵn), không qua fetch+blob —
 * cùng mẫu `revenueReport/api.ts`'s `revenueExportUrl`. */
export function customerGiftReportExportUrl(filters: CustomerGiftReportFilters): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.customerId) params.set("customer_id", filters.customerId);
  return `${apiPrefix}/api/v1/reports/customer-gifts/export?${params.toString()}`;
}
