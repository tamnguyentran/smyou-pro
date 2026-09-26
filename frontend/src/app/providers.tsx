import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { ToastProvider } from "../components/ui/Toast";
import { SESSION_KEY, type Session } from "../features/auth/api";
import { setSessionHandlers } from "../lib/api";
import { clearSignedIn } from "../lib/sessionHint";

export function AppProviders({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  // Refused refresh → signed out (guards show sign-in); silent refresh → keep the session fresh.
  useEffect(() => {
    setSessionHandlers({
      lost: () => {
        clearSignedIn();
        queryClient.setQueryData<Session>(SESSION_KEY, null);
      },
      renewed: (session) => {
        queryClient.setQueryData<Session>(SESSION_KEY, session);
      },
    });
    return () => {
      setSessionHandlers({});
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
