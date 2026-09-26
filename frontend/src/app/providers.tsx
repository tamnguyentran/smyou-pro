import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Stub (M1-01b red phase).
export function AppProviders({ children }: { queryClient: QueryClient; children: ReactNode }) {
  return <>{children}</>;
}
