import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test } from "vitest";
import { api } from "../lib/api";
import { markSignedIn } from "../lib/sessionHint";
import { server } from "../test/msw";
import { renderApp } from "../test/renderApp";

// Review M1-03a (round 2).
const id = "7d1f0c2e-0000-4000-8000-000000000010";
const session = {
  employee: { id, code: "NV010", full_name: "Phạm Quốc Tuấn", roles: ["TECH_LEAD"] },
  must_change_password: false,
};
const me = {
  employee: {
    id,
    code: "NV010",
    full_name: "Phạm Quốc Tuấn",
    email: "tuan.pham@smyou.vn",
    title: null,
    department: "TECHNICAL",
  },
  roles: ["TECH_LEAD"],
  capabilities: {
    "dashboard.read": ["all"],
    "task.manage": ["all"],
    "kpi.read": ["all"],
    "profile.manage": ["self"],
  },
  counters: {},
};

afterEach(() => {
  focusManager.setFocused(undefined);
});

describe("Review M1-03a — vòng 2", () => {
  test("AC-SYS-044 tải lại /me ngầm bị lỗi → vẫn giữ menu và trang đang dùng", async () => {
    let calls = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => HttpResponse.json(session)),
      http.get("/api/v1/me", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(me)
          : HttpResponse.json({ status: 503 }, { status: 503 });
      }),
    );
    markSignedIn();
    renderApp("/dispatch/board");
    // wait for the shell (the session guard shows its own <main> skeleton first)
    expect(await screen.findByText("Tính năng đang được phát triển.")).toBeInTheDocument();
    const main = screen.getByRole("main");

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => {
      expect(calls).toBe(2);
    });

    const nav = screen.getByRole("navigation", { name: "Menu chính" });
    expect(within(nav).getByRole("link", { name: "Bảng đầu việc" })).toBeInTheDocument();
    expect(within(main).getByText("Tính năng đang được phát triển.")).toBeInTheDocument();
    expect(screen.queryByText("Không tải được thông tin tài khoản.")).not.toBeInTheDocument();
  });

  test("AC-SYS-043 trang đang phát triển có nút Về trang chủ (spec §6)", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () => HttpResponse.json(session)),
      http.get("/api/v1/me", () => HttpResponse.json(me)),
    );
    markSignedIn();
    renderApp("/dispatch/board");

    expect(await screen.findByText("Tính năng đang được phát triển.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  });

  test("AC-SYS-044 phiên được làm mới ngầm → tải lại /me (spec §4)", async () => {
    let meCalls = 0;
    let healthCalls = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => HttpResponse.json(session)),
      http.get("/api/v1/me", () => {
        meCalls += 1;
        return HttpResponse.json(me);
      }),
      http.get("/api/v1/health", () => {
        healthCalls += 1;
        return healthCalls === 1
          ? HttpResponse.json({ status: 401, code: "UNAUTHENTICATED" }, { status: 401 })
          : HttpResponse.json({ status: "ok" });
      }),
    );
    markSignedIn();
    renderApp("/");
    await screen.findByRole("navigation", { name: "Menu chính" });
    expect(meCalls).toBe(1);

    await api.GET("/api/v1/health"); // 401 → silent refresh → retried

    await waitFor(() => {
      expect(meCalls).toBe(2);
    });
  });
});
