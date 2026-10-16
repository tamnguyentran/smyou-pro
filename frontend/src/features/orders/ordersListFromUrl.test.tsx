import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";

const hoaId = "a0000000-0000-4000-8000-000000000010";

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": all, "order.read": all, "order.create": all },
};

function signedInAs(id: string, person: Person) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id, code: person.code, full_name: person.full_name, roles: person.roles },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id,
          code: person.code,
          full_name: person.full_name,
          email: person.email,
          title: null,
          department: "MANAGEMENT",
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
    ),
  );
  markSignedIn();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("/orders đọc status/mine từ URL lúc tải", () => {
  test("AC-DASH-022 ?status=PENDING_DISPATCH&mine=1: chip + checkbox khớp URL, request gửi mine=true", async () => {
    signedInAs(hoaId, HOA);
    let lastQuery = "";
    server.use(
      http.get("/api/v1/orders", ({ request }) => {
        lastQuery = new URL(request.url).search;
        return HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 });
      }),
    );
    renderApp("/orders?status=PENDING_DISPATCH&mine=1");

    await waitFor(() => {
      expect(lastQuery).toContain("mine=true");
    });
    expect(lastQuery).toContain("status=PENDING_DISPATCH");
    expect(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Chờ điều phối",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "Chỉ đơn của tôi" })).toBeChecked();
  });

  test("AC-DASH-023 ?status=COMPLETED (không mine): checkbox không tick, request không có mine", async () => {
    signedInAs(hoaId, HOA);
    let lastQuery = "";
    server.use(
      http.get("/api/v1/orders", ({ request }) => {
        lastQuery = new URL(request.url).search;
        return HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 });
      }),
    );
    renderApp("/orders?status=COMPLETED");

    await waitFor(() => {
      expect(lastQuery).toContain("status=COMPLETED");
    });
    expect(lastQuery).not.toContain("mine");
    expect(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Hoàn tất",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "Chỉ đơn của tôi" })).not.toBeChecked();
  });

  test("AC-DASH-026 ?status=DRAFT&mine=1 trả về rỗng: không lỗi, chip vẫn chọn 'Nháp'", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/orders?status=DRAFT&mine=1");

    expect(await screen.findByText("Không tìm thấy đơn nào.")).toBeInTheDocument();
    expect(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Nháp",
      }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("AC-DASH-036 (M10-07a) chip 'Quá hạn' và chip trạng thái loại trừ lẫn nhau", async () => {
    signedInAs(hoaId, HOA);
    let lastQuery = "";
    server.use(
      http.get("/api/v1/orders", ({ request }) => {
        lastQuery = new URL(request.url).search;
        return HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 });
      }),
    );
    renderApp("/orders?overdue=1");

    await waitFor(() => {
      expect(lastQuery).toContain("overdue=true");
    });
    expect(lastQuery).not.toContain("status=");
    expect(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Quá hạn",
      }),
    ).toHaveAttribute("aria-checked", "true");

    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Chờ điều phối",
      }),
    );

    await waitFor(() => {
      expect(lastQuery).toContain("status=PENDING_DISPATCH");
    });
    expect(lastQuery).not.toContain("overdue");
    expect(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Quá hạn",
      }),
    ).toHaveAttribute("aria-checked", "false");
  });
});
