import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type MyAssignment = components["schemas"]["MyAssignmentOut"];
export const MY_ASSIGNMENTS_KEY = "my-assignments";

/** AC-ASG-001…004: phân công của chính tôi (M5-01) — `GET /api/v1/assignments/me`. */
export function useMyAssignments({ enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: [MY_ASSIGNMENTS_KEY],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/assignments/me");
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}
