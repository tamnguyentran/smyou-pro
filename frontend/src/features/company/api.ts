import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type CompanyProfile = components["schemas"]["CompanyProfileOut"];
export type CompanyProfileUpdateBody = components["schemas"]["CompanyProfileUpdate"];

export const COMPANY_PROFILE_KEY = "company-profile";

/** Logo served by GET /api/v1/attachments/{id} (cookie-auth, inline; `company.manage` only). */
export function companyLogoUrl(attachmentId: string): string {
  return `${resolveBasePath(import.meta.env.BASE_URL).apiPrefix}/api/v1/attachments/${attachmentId}`;
}

export function useCompanyProfile(enabled: boolean) {
  return useQuery({
    queryKey: [COMPANY_PROFILE_KEY],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/company-profile");
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

export function useUpdateCompanyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CompanyProfileUpdateBody) => {
      const { data, error, response } = await api.PATCH("/api/v1/company-profile", { body });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData([COMPANY_PROFILE_KEY], profile);
    },
  });
}

export function useUploadCompanyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, version }: { file: File; version: number }) => {
      const form = new FormData();
      form.append("file", file);
      const { data, error, response } = await api.POST("/api/v1/company-profile/logo", {
        params: { query: { version } },
        body: form as unknown as { file: string },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData([COMPANY_PROFILE_KEY], profile);
    },
  });
}
