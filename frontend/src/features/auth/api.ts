import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { LoginResponse } from "../../lib/api/client";
import { clearSignedIn, hasSignedIn, markSignedIn } from "../../lib/sessionHint";
import { ME_KEY } from "../me/api";
import { toApiError } from "./errors";
import type { ForgotPasswordValues, LoginValues } from "./schemas";

export type Session = LoginResponse | null;
export const SESSION_KEY = ["session"] as const;

/** Current session: restored with one refresh (the cookies are httpOnly), or null when signed out. */
export function useSession() {
  return useQuery<Session>({
    queryKey: SESSION_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      if (!hasSignedIn()) return null;
      const session = await api.refreshSession();
      if (session === null) clearSignedIn();
      return session;
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: LoginValues) => {
      const { data, error, response } = await api.POST("/api/v1/auth/login", { body: values });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: (session) => {
      markSignedIn();
      queryClient.removeQueries({ queryKey: ME_KEY }); // another account may have used this tab
      queryClient.setQueryData<Session>(SESSION_KEY, session);
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: { current_password: string; new_password: string }) => {
      const { error, response } = await api.POST("/api/v1/auth/change-password", { body: values });
      if (!response.ok) throw toApiError(response, error);
    },
    onSuccess: () => {
      queryClient.setQueryData<Session>(SESSION_KEY, (s) =>
        s ? { ...s, must_change_password: false } : s,
      );
    },
  });
}

/** Clears only the local "signed in" state, without calling the API — for reset-password (AC-AUTH-059):
 * the server already revoked every session for that account, there's nothing left to tell it. */
function clearLocalSession(queryClient: QueryClient): void {
  clearSignedIn();
  queryClient.removeQueries({ queryKey: ME_KEY });
  queryClient.setQueryData<Session>(SESSION_KEY, null);
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST("/api/v1/auth/logout");
      if (!response.ok) throw toApiError(response, error);
    },
    // Only once the server revoked the session: otherwise the refresh cookie would still work
    // on this (possibly shared) device while the screen claims the user is signed out.
    onSuccess: () => {
      clearLocalSession(queryClient);
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (values: ForgotPasswordValues) => {
      const { data, error, response } = await api.POST("/api/v1/auth/forgot-password", {
        body: values,
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: { token: string; new_password: string }) => {
      const { error, response } = await api.POST("/api/v1/auth/reset-password", { body: values });
      if (!response.ok) throw toApiError(response, error);
    },
    onSuccess: () => {
      clearLocalSession(queryClient);
    },
  });
}
