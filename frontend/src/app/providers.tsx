import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { ToastProvider } from "../components/ui/Toast";
import { SESSION_KEY, type Session } from "../features/auth/api";
import { setSessionLostHandler } from "../lib/api";
import { clearSignedIn } from "../lib/sessionHint";

export function AppProviders({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  // A refused refresh anywhere means "signed out": the route guards then show the sign-in page.
  useEffect(() => {
    setSessionLostHandler(() => {
      clearSignedIn();
      queryClient.setQueryData<Session>(SESSION_KEY, null);
    });
    return () => {
      setSessionLostHandler(undefined);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
