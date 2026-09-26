import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type Me = components["schemas"]["MeResponse"];
export const ME_KEY = ["me"] as const;

/** Who am I, what may I do (capability → scopes), badge counters — the menu is drawn from this. */
export function useMe() {
  return useQuery<Me>({
    queryKey: ME_KEY,
    staleTime: 30_000,
    // Badges and roles change while the tab sits in the background: reload on return (spec §4).
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/me");
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}
