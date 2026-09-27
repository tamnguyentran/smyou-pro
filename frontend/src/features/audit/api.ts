import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type AuditEventOut = components["schemas"]["AuditEventOut"];
export type EntityType = components["schemas"]["EntityType"];

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

export type EmployeeSummary = components["schemas"]["EmployeeOut"];

/** Every employee, all pages (the API caps a page at 100): the log names who was acted on and the
 * actor filter lists everyone — newest employees included, which sort last by code. */
export function useEmployeeDirectory() {
  return useQuery({
    queryKey: [AUDIT_EVENTS_KEY, "employee-directory"],
    queryFn: async () => {
      const all: EmployeeSummary[] = [];
      for (;;) {
        const { data, error, response } = await api.GET("/api/v1/employees", {
          params: { query: { limit: 100, offset: all.length } },
        });
        if (!data) throw toApiError(response, error);
        all.push(...data.items);
        if (data.items.length === 0 || all.length >= data.total) return all;
      }
    },
  });
}
