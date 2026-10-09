import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, test, expect } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";

const id = "7d1f0c2e-0000-4000-8000-000000000061";

function signedInWithoutProfileManage() {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id, code: "NV014", full_name: "Trần Minh Khoa", roles: ["TECHNICIAN"] },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id,
          code: "NV014",
          full_name: "Trần Minh Khoa",
          email: "khoa.tran@smyou.vn",
          title: null,
          department: "TECHNICAL",
        },
        roles: ["TECHNICIAN"],
        capabilities: { "dashboard.read": ["self"] },
        counters: {},
        unread_notifications_count: 0,
      }),
    ),
  );
  markSignedIn();
}

describe("Trang /ca-nhan", () => {
  test("AC-NTF-033 thiếu profile.manage → ForbiddenPage", async () => {
    signedInWithoutProfileManage();
    renderApp("/ca-nhan");
    expect(await screen.findByText(/Bạn không có quyền/)).toBeInTheDocument();
  });
});
