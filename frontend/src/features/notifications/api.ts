import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";
import { ME_KEY } from "../me/api";

export type Notification = components["schemas"]["NotificationOut"];

export interface NotificationFilters {
  limit: number;
  offset: number;
}

export const NOTIFICATIONS_KEY = "notifications";

/** Trang danh sách `/thong-bao`, phân trang — mới nhất trước (thứ tự do server trả, FE không sắp lại). */
export function useNotifications(filters: NotificationFilters) {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, filters],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/notifications", {
        params: { query: { limit: filters.limit, offset: filters.offset } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
    // unread_notifications_count lives on /me (M7-01a §3), not a separate endpoint.
    void queryClient.invalidateQueries({ queryKey: ME_KEY });
  };
}

/** Đánh dấu 1 thông báo đã đọc — âm thầm, không toast (spec §6). */
export function useMarkRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await api.POST(
        "/api/v1/notifications/{notification_id}/read",
        { params: { path: { notification_id: id } } },
      );
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useMarkAllRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST("/api/v1/notifications/mark-all-read");
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: invalidate,
  });
}
