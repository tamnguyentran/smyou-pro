import { QueryClient } from "@tanstack/react-query";

/** The app's query defaults (also used by component tests, so they run with the real settings). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}
