import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type AuditEventOut = components["schemas"]["AuditEventOut"];
export type EntityType = "EMPLOYEE";

export interface AuditEventFilters {
  entityType: EntityType | "";
  actorId: string;
  occurredFrom: string;
  occurredTo: string;
  limit: number;
  offset: number;
}

export const AUDIT_EVENTS_KEY = "audit-events";

/** `enabled: false` keeps showing the last result (placeholderData) without sending a request. */
export function useAuditEvents(filters: AuditEventFilters, { enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: [AUDIT_EVENTS_KEY, filters],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/audit-events", {
        params: {
          query: {
            entity_type: filters.entityType || undefined,
            actor_id: filters.actorId || undefined,
            occurred_from: filters.occurredFrom || undefined,
            occurred_to: filters.occurredTo || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
        },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}
