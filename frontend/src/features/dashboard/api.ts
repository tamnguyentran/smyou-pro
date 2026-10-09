import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type Dashboard = components["schemas"]["DashboardOut"];
export const DASHBOARD_KEY = ["dashboard"];

/** AC-DASH-001…008 (M7-02): số liệu tổng quan tuỳ theo vai trò — `GET /api/v1/dashboard`. */
export function useDashboard({ enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: DASHBOARD_KEY,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/dashboard");
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}
