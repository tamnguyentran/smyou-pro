import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createQueryClient } from "../../app/queryClient";
import { ME_KEY } from "../me/api";
import { NOTIFICATIONS_KEY } from "./api";
import { useNotificationsRealtime } from "./useNotificationsRealtime";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

function wrapper(queryClient: ReturnType<typeof createQueryClient>) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useNotificationsRealtime (M7-03)", () => {
  test("AC-NTF-038: nhận message 'notification' → làm mới GET /me + danh sách thông báo", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const queryClient = createQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(
      () => {
        useNotificationsRealtime();
      },
      { wrapper: wrapper(queryClient) },
    );

    const socket = FakeWebSocket.instances.at(0);
    expect(socket).toBeDefined();
    socket?.onmessage?.({ data: JSON.stringify({ type: "notification", notification: {} }) });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ME_KEY });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [NOTIFICATIONS_KEY] });
  });

  test("AC-NTF-039: message không phải 'notification' → không làm mới gì", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const queryClient = createQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(
      () => {
        useNotificationsRealtime();
      },
      { wrapper: wrapper(queryClient) },
    );

    FakeWebSocket.instances.at(0)?.onmessage?.({ data: JSON.stringify({ type: "ping" }) });

    expect(invalidate).not.toHaveBeenCalled();
  });

  test("AC-NTF-040: mất kết nối (onclose) → tự nối lại sau một khoảng giãn dần", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const queryClient = createQueryClient();

    renderHook(
      () => {
        useNotificationsRealtime();
      },
      { wrapper: wrapper(queryClient) },
    );
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances.at(0)?.onclose?.();
    vi.advanceTimersByTime(1500);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  test("AC-NTF-041: unmount → đóng socket, không nối lại nữa", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const queryClient = createQueryClient();

    const { unmount } = renderHook(
      () => {
        useNotificationsRealtime();
      },
      { wrapper: wrapper(queryClient) },
    );
    const socket = FakeWebSocket.instances.at(0);
    expect(socket).toBeDefined();
    unmount();

    expect(socket?.closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
