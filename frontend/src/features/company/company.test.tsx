import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";

const all = ["all"];
const self = ["self"];

interface Person {
  code: string;
  full_name: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  roles: ["MANAGER"],
  capabilities: { "dashboard.read": all, "company.manage": all, "profile.manage": self },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Lê Thị Hoa",
  roles: ["SALE"],
  capabilities: { "dashboard.read": ["own"], "profile.manage": self },
};

const PROFILE = {
  name: "CÔNG TY TNHH SMYOU",
  tax_code: "0309390732",
  address: "8C/A-9C/A Nguyễn Ảnh Thủ, Khu Phố 1, P. Trung Mỹ Tây, TP.HCM",
  phone: "0932068787",
  phone_secondary: "02862501997",
  fax: "02862533978",
  email: "kimyensmyou@gmail.com",
  website: "http://smyou.vn",
  logo_attachment_id: null as string | null,
  version: 1,
  updated_at: "2026-10-28T01:00:00Z",
};

function signedInAs(person: Person) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: {
          id: "self",
          code: person.code,
          full_name: person.full_name,
          roles: person.roles,
        },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id: "self",
          code: person.code,
          full_name: person.full_name,
          email: "x@smyou.vn",
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

function desktop() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openPage() {
  await screen.findByRole("heading", { level: 1, name: "Thông tin công ty" });
  return screen.findByRole("form", { name: "Thông tin công ty" });
}

describe("AC-SYS-133 màn Thông tin công ty", () => {
  test("form điền sẵn, 2 cột từ md:, chưa có logo; sửa địa chỉ → Lưu → toast", async () => {
    desktop();
    signedInAs(AN);
    let patched: unknown = null;
    server.use(
      http.get("/api/v1/company-profile", () => HttpResponse.json(PROFILE)),
      http.patch("/api/v1/company-profile", async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ ...PROFILE, address: "KP1, Trung Mỹ Tây", version: 2 });
      }),
    );
    renderApp("/settings/company");
    const form = await openPage();

    expect(await within(form).findByDisplayValue("CÔNG TY TNHH SMYOU")).toBeInTheDocument();
    expect(within(form).getByLabelText(/Mã số thuế/)).toHaveValue("0309390732");
    expect(within(form).getByLabelText(/Điện thoại 1/)).toHaveValue("0932068787");
    expect(within(form).getByLabelText(/Điện thoại 2/)).toHaveValue("02862501997");
    expect(within(form).getByLabelText(/Fax/)).toHaveValue("02862533978");
    expect(within(form).getByLabelText(/Email/)).toHaveValue("kimyensmyou@gmail.com");
    expect(within(form).getByLabelText(/Website/)).toHaveValue("http://smyou.vn");
    expect(form.querySelector(".md\\:grid-cols-2")).not.toBeNull();
    expect(screen.getByText("Chưa có logo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải logo" })).toBeInTheDocument();

    const user = userEvent.setup();
    const save = within(form).getByRole("button", { name: "Lưu" });
    expect(save).toBeDisabled();
    const address = within(form).getByLabelText(/Địa chỉ/);
    await user.clear(address);
    await user.type(address, "KP1, Trung Mỹ Tây");
    await waitFor(() => {
      expect(save).toBeEnabled();
    });
    await user.click(save);

    expect(await screen.findByText("Đã lưu thông tin công ty")).toBeInTheDocument();
    expect(patched).toEqual({ address: "KP1, Trung Mỹ Tây", version: 1 });
  });

  test("đã có logo → hiện ảnh logo", async () => {
    desktop();
    signedInAs(AN);
    server.use(
      http.get("/api/v1/company-profile", () =>
        HttpResponse.json({
          ...PROFILE,
          logo_attachment_id: "f0000000-0000-4000-8000-000000000001",
        }),
      ),
    );
    renderApp("/settings/company");
    await openPage();

    const logo = await screen.findByRole("img", { name: "Logo công ty" });
    expect(logo.getAttribute("src")).toContain(
      "/api/v1/attachments/f0000000-0000-4000-8000-000000000001",
    );
    expect(screen.queryByText("Chưa có logo")).not.toBeInTheDocument();
  });
});

describe("AC-SYS-135 lỗi nhập liệu hiện ngay dưới ô", () => {
  test("xoá tên công ty hoặc nhập email sai → lỗi tiếng Việt, nút Lưu bị vô hiệu", async () => {
    desktop();
    signedInAs(AN);
    server.use(http.get("/api/v1/company-profile", () => HttpResponse.json(PROFILE)));
    renderApp("/settings/company");
    const form = await openPage();
    await within(form).findByDisplayValue("CÔNG TY TNHH SMYOU");
    const user = userEvent.setup();
    const save = within(form).getByRole("button", { name: "Lưu" });

    await user.clear(within(form).getByLabelText(/Tên công ty/));
    expect(await within(form).findByText(/Vui lòng nhập tên công ty/)).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.type(within(form).getByLabelText(/Tên công ty/), "CÔNG TY TNHH SMYOU MỚI");
    const email = within(form).getByLabelText(/Email/);
    await user.clear(email);
    await user.type(email, "kimyen");
    expect(await within(form).findByText(/Email không hợp lệ/)).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.type(email, "@gmail.com");
    await waitFor(() => {
      expect(save).toBeEnabled();
    });
  });
});

describe("AC-SYS-136 409 STALE_VERSION", () => {
  test("hiện thông báo server + nút Tải lại; bấm Tải lại nạp dữ liệu mới nhất", async () => {
    desktop();
    signedInAs(AN);
    let latest = false;
    server.use(
      http.get("/api/v1/company-profile", () =>
        HttpResponse.json(
          latest ? { ...PROFILE, address: "Địa chỉ Bình vừa sửa", version: 2 } : PROFILE,
        ),
      ),
      http.patch("/api/v1/company-profile", () => {
        latest = true;
        return HttpResponse.json(
          {
            status: 409,
            code: "STALE_VERSION",
            detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
          },
          { status: 409 },
        );
      }),
    );
    renderApp("/settings/company");
    const form = await openPage();
    await within(form).findByDisplayValue("CÔNG TY TNHH SMYOU");
    const user = userEvent.setup();
    await user.type(within(form).getByLabelText(/Địa chỉ/), " (mới)");
    await user.click(within(form).getByRole("button", { name: "Lưu" }));

    expect(
      await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tải lại" }));

    expect(await within(form).findByDisplayValue("Địa chỉ Bình vừa sửa")).toBeInTheDocument();
    expect(within(form).getByLabelText(/Fax/)).toHaveValue("02862533978");
  });
});

describe("AC-SYS-137 chỉ Manager", () => {
  test("Manager thấy mục menu Thông tin công ty", async () => {
    desktop();
    signedInAs(AN);
    server.use(http.get("/api/v1/company-profile", () => HttpResponse.json(PROFILE)));
    renderApp("/settings/company");
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    expect(within(nav).getByRole("link", { name: "Thông tin công ty" })).toBeInTheDocument();
  });

  test("Sale không thấy mục menu; mở URL trực tiếp → trang không có quyền", async () => {
    desktop();
    signedInAs(HOA);
    renderApp("/settings/company");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    expect(within(nav).queryByRole("link", { name: "Thông tin công ty" })).not.toBeInTheDocument();
  });
});
