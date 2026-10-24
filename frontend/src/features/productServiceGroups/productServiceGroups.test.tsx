import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { ProductServiceGroup } from "./api";

const id = "9d1f0c2e-0000-4000-8000-000000000001";

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const self = ["self"];
const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": all,
    "catalog.read": all,
    "catalog.manage": all,
    "profile.manage": self,
  },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Lê Thị Hoa",
  email: "hoa.le@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": ["own"], "catalog.read": all, "profile.manage": self },
};

function group(overrides: Partial<ProductServiceGroup> = {}): ProductServiceGroup {
  return {
    id: "e0000000-0000-4000-8000-000000000005",
    name: "Thiết bị văn phòng",
    is_active: true,
    version: 1,
    ...overrides,
  };
}

function page(items: ProductServiceGroup[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

function signedInAs(person: Person, groupsHandler?: Parameters<typeof http.get>[1]) {
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
    ...(groupsHandler ? [http.get("/api/v1/product-service-groups", groupsHandler)] : []),
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
  vi.clearAllMocks();
});

describe("AC-CAT-097 danh sách nhóm sản phẩm/dịch vụ", () => {
  test("An (MANAGER) desktop 1440px: thấy bảng + nút 'Thêm nhóm'", async () => {
    mockViewport(true);
    signedInAs(AN, () =>
      HttpResponse.json(
        page([group({ name: "Thiết bị văn phòng" }), group({ name: "Thiết bị an ninh" })]),
      ),
    );
    renderApp("/catalog/groups");

    await screen.findByRole("heading", { level: 1, name: "Nhóm sản phẩm/dịch vụ" });
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Thiết bị văn phòng")).toBeInTheDocument();
    expect(within(table).getByText("Thiết bị an ninh")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm nhóm" })).toBeInTheDocument();
  });

  test("Hoa (SALE, chỉ catalog.read) không thấy nút 'Thêm nhóm'", async () => {
    mockViewport(true);
    signedInAs(HOA, () => HttpResponse.json(page([group()])));
    renderApp("/catalog/groups");

    await screen.findByRole("heading", { level: 1, name: "Nhóm sản phẩm/dịch vụ" });
    await screen.findByLabelText("Tìm kiếm");
    expect(screen.queryByRole("button", { name: "Thêm nhóm" })).not.toBeInTheDocument();
  });

  test("An tạo nhóm mới qua Sheet", async () => {
    mockViewport(true);
    signedInAs(AN, () => HttpResponse.json(page([])));
    let created: { name: string } | null = null;
    server.use(
      http.post("/api/v1/product-service-groups", async ({ request }) => {
        created = (await request.json()) as { name: string };
        return HttpResponse.json(group({ name: created.name }), { status: 201 });
      }),
    );
    renderApp("/catalog/groups");
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 1, name: "Nhóm sản phẩm/dịch vụ" });
    await user.click(await screen.findByRole("button", { name: "Thêm nhóm" }));
    await user.type(screen.getByLabelText("Tên nhóm"), "Thiết bị mạng");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    expect(created).toEqual({ name: "Thiết bị mạng" });
  });
});
