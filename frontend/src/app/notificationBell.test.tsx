import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../lib/sessionHint";
import { server } from "../test/msw";
import { renderApp } from "../test/renderApp";

const id = "7d1f0c2e-0000-4000-8000-000000000050";
const SELF = ["self"];

function meBody(unreadCount: number) {
  return {
    employee: {
      id,
      code: "NV014",
      full_name: "Trần Minh Khoa",
      email: "khoa.tran@smyou.vn",
      title: null,
      department: "TECHNICAL",
    },
    roles: ["TECHNICIAN"],
    capabilities: { "dashboard.read": SELF, "notification.read": SELF, "profile.manage": SELF },
    counters: {},
    unread_notifications_count: unreadCount,
  };
}

function signedInAs(unreadCount: number) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id, code: "NV014", full_name: "Trần Minh Khoa", roles: ["TECHNICIAN"] },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () => HttpResponse.json(meBody(unreadCount))),
  );
  markSignedIn();
}

function mockViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Chuông thông báo", () => {
  test("AC-NTF-021 header desktop hiện chuông có badge số chưa đọc", async () => {
    mockViewport(true);
    signedInAs(3);
    renderApp("/");
    const bell = await screen.findByRole("link", { name: "Thông báo, 3 chưa đọc" });
    expect(bell).toHaveAttribute("href", "/thong-bao");
    expect(within(bell).getByText("3")).toBeInTheDocument();
  });

  test("AC-NTF-022 header mobile và BottomNav đều hiện badge", async () => {
    mockViewport(false);
    signedInAs(3);
    renderApp("/");
    expect(await screen.findByRole("link", { name: "Thông báo, 3 chưa đọc" })).toHaveAttribute(
      "href",
      "/thong-bao",
    );
    const nav = await screen.findByRole("navigation", { name: "Điều hướng nhanh" });
    const navLink = within(nav).getByRole("link", { name: "Thông báo" });
    await waitFor(() => {
      expect(within(navLink).getByText("3")).toBeInTheDocument();
    });
  });

  test("AC-NTF-023 unread_notifications_count=0 → không hiện badge", async () => {
    mockViewport(true);
    signedInAs(0);
    renderApp("/");
    const bell = await screen.findByRole("link", { name: "Thông báo" });
    expect(bell.querySelector("span[aria-hidden]")).not.toBeInTheDocument();
  });

  test("AC-NTF-024 badge hiện đúng '99' khi count=99", async () => {
    mockViewport(true);
    signedInAs(99);
    renderApp("/");
    expect(await screen.findByText("99")).toBeInTheDocument();
  });

  test("AC-NTF-024 badge hiện '99+' khi count=120", async () => {
    mockViewport(true);
    signedInAs(120);
    renderApp("/");
    expect(await screen.findByText("99+")).toBeInTheDocument();
  });

  test("AC-NTF-025 polling 30s cập nhật badge không cần tải lại trang", async () => {
    vi.useFakeTimers();
    mockViewport(true);
    signedInAs(0);
    renderApp("/");
    await vi.waitFor(() => {
      expect(screen.getByRole("link", { name: "Thông báo" })).toBeInTheDocument();
    });
    expect(screen.queryByText("1")).not.toBeInTheDocument();

    signedInAs(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => {
      expect(screen.getByRole("link", { name: "Thông báo, 1 chưa đọc" })).toBeInTheDocument();
    });
    vi.useRealTimers();
  });
});
