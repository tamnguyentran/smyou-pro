import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { resolveBasePath } from "../../lib/basePath";
import { DASHBOARD_KEY } from "../dashboard/api";
import { ME_KEY } from "../me/api";
import { NOTIFICATIONS_KEY } from "./api";

function wsUrl(): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${apiPrefix}/api/v1/notifications/ws`;
}

const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/** M7-03: kênh realtime cho thông báo — kết nối sớm nhận ngay thông báo mới (làm mới số chưa đọc
 * + danh sách), không thay cho polling 30s đã có ở `useMe` (vẫn giữ nguyên làm lưới an toàn khi
 * WS rớt/chưa kết nối lại được). Mất kết nối → tự nối lại, giãn dần tới tối đa 30s. */
export function useNotificationsRealtime(): void {
  const queryClient = useQueryClient();
  const attempt = useRef(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect(): void {
      if (stopped) return;
      socket = new WebSocket(wsUrl());
      socket.onopen = () => {
        attempt.current = 0;
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (
          typeof data === "object" &&
          data !== null &&
          (data as { type?: unknown }).type === "notification"
        ) {
          void queryClient.invalidateQueries({ queryKey: ME_KEY });
          void queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
          // Chỉ ảnh hưởng khi đang mở màn "Tổng quan" — react-query chỉ refetch ngay query đang
          // active (mounted); nếu không, chỉ đánh dấu stale, tự lấy lại khi quay lại trang.
          void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * 2 ** attempt.current,
          MAX_RECONNECT_DELAY_MS,
        );
        attempt.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [queryClient]);
}
