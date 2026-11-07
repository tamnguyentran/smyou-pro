import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type BusinessResults = components["schemas"]["BusinessResultsOut"];
export type BusinessSales = components["schemas"]["BusinessSalesOut"];
export type BusinessStaff = components["schemas"]["BusinessStaffOut"];
export type Share = components["schemas"]["ShareOut"];
export type Metric = "revenue" | "profit";

/** M25-01: cards whose periods overlap reuse each other's numbers instead of refetching (B2-10). */
const STALE_MS = 60_000;

/** `YYYY-MM` bounds; `valid` false → the query stays disabled (AC-RPT-132). */
export interface Period {
  from: string;
  to: string;
  valid: boolean;
}

/** M23a `GET /api/v1/reports/business-charts/results`. */
export function useBusinessResults(period: Period) {
  const query = { from: period.from, to: period.to };
  return useQuery({
    enabled: period.valid,
    staleTime: STALE_MS,
    queryKey: ["business-charts", "results", query],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/reports/business-charts/results", {
        params: { query },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** M23a `GET /api/v1/reports/business-charts/sales` — `metric` drives the Pareto only. */
export function useBusinessSales(period: Period, metric: Metric) {
  const query = { from: period.from, to: period.to, metric };
  return useQuery({
    enabled: period.valid,
    staleTime: STALE_MS,
    queryKey: ["business-charts", "sales", query],
    // Switching the Pareto metric keeps the old chart on screen instead of flashing skeletons.
    placeholderData: (previous: BusinessSales | undefined) =>
      previous?.from === period.from && previous.to === period.to ? previous : undefined,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/reports/business-charts/sales", {
        params: { query },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** M23a `GET /api/v1/reports/business-charts/staff`. */
export function useBusinessStaff(period: Period) {
  const query = { from: period.from, to: period.to };
  return useQuery({
    enabled: period.valid,
    staleTime: STALE_MS,
    queryKey: ["business-charts", "staff", query],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/reports/business-charts/staff", {
        params: { query },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}
