import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";
import type { RevenueStatus } from "./api";

export type ProductRevenueRow = components["schemas"]["ProductRevenueRowOut"];
export type ProductRevenueMode = "group" | "item";

export interface ProductRevenueFilters {
  from: string;
  to: string;
  status: RevenueStatus;
  /** `""` = Tất cả, `"ungrouped"` = Chưa phân nhóm, còn lại là id nhóm SP/DV. */
  groupId: string;
}

export const PRODUCT_REVENUE_REPORT_KEY = "revenue-by-product-report";
export const PRODUCT_REVENUE_LINES_KEY = "revenue-by-product-lines";

function query(mode: ProductRevenueMode, filters: ProductRevenueFilters) {
  return {
    mode,
    from: filters.from,
    to: filters.to,
    status: filters.status,
    group_id: filters.groupId || undefined,
  };
}

/** M24-01a `GET /api/v1/reports/revenue-by-product`. */
export function useProductRevenueReport(
  mode: ProductRevenueMode,
  filters: ProductRevenueFilters,
  { enabled = true } = {},
) {
  return useQuery({
    enabled,
    queryKey: [
      PRODUCT_REVENUE_REPORT_KEY,
      mode,
      filters.from,
      filters.to,
      filters.status,
      filters.groupId || undefined,
    ],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/reports/revenue-by-product", {
        params: { query: query(mode, filters) },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** M24-01a `GET /api/v1/reports/revenue-by-product/lines` — dòng hàng của 1 `key` (nhóm hoặc SP/DV). */
export function useProductRevenueLines(
  mode: ProductRevenueMode,
  key: string,
  filters: ProductRevenueFilters,
) {
  return useQuery({
    queryKey: [
      PRODUCT_REVENUE_LINES_KEY,
      mode,
      key,
      filters.from,
      filters.to,
      filters.status,
      filters.groupId || undefined,
    ],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/reports/revenue-by-product/lines", {
        params: { query: { ...query(mode, filters), key } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** AC-RPT-157: trình duyệt tải trực tiếp URL này (session cookie có sẵn), giống AC-RPT-033. */
export function productRevenueExportUrl(
  mode: ProductRevenueMode,
  filters: ProductRevenueFilters,
): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  const params = new URLSearchParams({
    mode,
    from: filters.from,
    to: filters.to,
    status: filters.status,
  });
  if (filters.groupId) params.set("group_id", filters.groupId);
  return `${apiPrefix}/api/v1/reports/revenue-by-product/export?${params.toString()}`;
}
