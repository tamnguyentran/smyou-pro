import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { toApiError } from "../auth/errors";

export type Dashboard = components["schemas"]["DashboardOut"];
export const DASHBOARD_KEY = ["dashboard"];

/** AC-DASH-001…008 (M7-02): số liệu tổng quan tuỳ theo vai trò — `GET /api/v1/dashboard`. */
export function useDashboard({ enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: DASHBOARD_KEY,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/dashboard");
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

export type DashboardCardItems = components["schemas"]["DashboardCardItemsOut"];
export const CARD_PAGE_SIZE = 20;

/** M18-01a (AC-DASH-066…069): dòng đơn/đầu việc tạo nên số trên 1 thẻ Tổng quan, 20 dòng/trang. */
export function useDashboardCardItems(card: string | null, page: number) {
  return useQuery({
    enabled: card !== null,
    queryKey: [...DASHBOARD_KEY, "card", card, page],
    // Đổi trang trong cùng thẻ: giữ trang cũ (tiêu đề có số, Pagination, focus) tới khi trang mới về;
    // đổi sang thẻ khác thì không giữ, để không hiện dòng của thẻ trước.
    placeholderData: (prev: DashboardCardItems | undefined) =>
      prev?.card === card ? prev : undefined,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/v1/dashboard/cards/{card}/items", {
        params: { path: { card: card ?? "" }, query: { page, page_size: CARD_PAGE_SIZE } },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

/** M18-01a (AC-DASH-081): tải CSV qua fetch+blob (không phải link trực tiếp như báo cáo doanh thu)
 * để nút hiện được "Đang xuất…" và báo lỗi mạng bằng toast. */
export async function downloadDashboardCard(card: string): Promise<void> {
  const { data, error, response } = await api.GET("/api/v1/dashboard/cards/{card}/export", {
    params: { path: { card } },
    parseAs: "blob",
  });
  if (!response.ok || !data) throw toApiError(response, error);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${card}.csv`;
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // Safari/Firefox: link phải nằm trong DOM, và chỉ thu hồi blob URL sau khi trình duyệt đã bắt đầu tải.
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
