import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { ME_KEY } from "../me/api";
import { toApiError } from "../auth/errors";

export type MyAssignment = components["schemas"]["MyAssignmentOut"];
export type AssignmentAcceptBody = components["schemas"]["AssignmentAccept"];
export type AssignmentRejectBody = components["schemas"]["AssignmentReject"];
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

/** AC-ASG-017…025 (M5-02): tiếp nhận 1 phân công của chính mình. */
export function useAcceptAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assignmentId,
      body,
    }: {
      assignmentId: string;
      body: AssignmentAcceptBody;
    }) => {
      const { data, error, response } = await api.POST(
        "/api/v1/assignments/{assignment_id}/accept",
        {
          params: { path: { assignment_id: assignmentId } },
          body,
        },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MY_ASSIGNMENTS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

/** AC-ASG-026…034 (M5-02): từ chối 1 phân công của chính mình, kèm lý do. */
export function useRejectAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assignmentId,
      body,
    }: {
      assignmentId: string;
      body: AssignmentRejectBody;
    }) => {
      const { data, error, response } = await api.POST(
        "/api/v1/assignments/{assignment_id}/reject",
        {
          params: { path: { assignment_id: assignmentId } },
          body,
        },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MY_ASSIGNMENTS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}
