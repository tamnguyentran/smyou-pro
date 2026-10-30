import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { hasSignedIn, markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";

const AN = {
  id: "7d1f0c2e-0000-4000-8000-000000000001",
  code: "NV001",
  full_name: "Nguyễn Văn An",
  roles: ["MANAGER"],
};
const KHOA = {
  id: "7d1f0c2e-0000-4000-8000-000000000014",
  code: "NV014",
  full_name: "Trần Minh Khoa",
  roles: ["TECHNICIAN"],
};

const problem = (status: number, code: string, detail: string, errors?: unknown[]) =>
  HttpResponse.json({ status, code, detail, ...(errors ? { errors } : {}) }, { status });

/** M7-02: trang "/" (DashboardPage) tự gọi /me + /dashboard — các test đăng nhập ở đây không
 * quan tâm nội dung dashboard, chỉ cần 2 API này không bị treo "unhandled request". */
function mockDashboardApis() {
  server.use(
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id: AN.id,
          code: AN.code,
          full_name: AN.full_name,
          email: "",
          department: null,
        },
        roles: AN.roles,
        capabilities: { "dashboard.read": ["all"] },
        counters: {},
      }),
    ),
    http.get("/api/v1/dashboard", () => HttpResponse.json({})),
  );
}

async function fillLogin(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Tên đăng nhập"), username);
  await user.type(screen.getByLabelText("Mật khẩu"), password);
  return user;
}

describe("Trang đăng nhập", () => {
  test("AC-AUTH-021 chưa đăng nhập → chuyển tới /dang-nhap?next=, form đủ nhãn, không gọi API khi chưa từng đăng nhập", async () => {
    const router = renderApp("/");

    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dang-nhap");
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe("/");
    expect(screen.getByLabelText("Tên đăng nhập")).toHaveAttribute("type", "text");
    const password = screen.getByLabelText("Mật khẩu");
    expect(password).toHaveAttribute("type", "password");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Hiện mật khẩu" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ẩn mật khẩu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
  });

  test.each([
    [401, "INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng."],
    [
      423,
      "ACCOUNT_LOCKED",
      "Tài khoản tạm khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau 15 phút.",
    ],
    [403, "ACCOUNT_DISABLED", "Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ quản lý."],
  ])(
    "AC-AUTH-022 lỗi %i hiện đúng thông báo của server, nút bị khoá khi đang gửi",
    async (status, code, detail) => {
      server.use(
        http.post("/api/v1/auth/login", async () => {
          await delay(50);
          return problem(status, code, detail);
        }),
      );
      renderApp("/dang-nhap");
      const user = await fillLogin("an.nguyen@smyou.vn", "sai-mat-khau");

      const button = screen.getByRole("button", { name: "Đăng nhập" });
      await user.click(button);
      // Both attributes come from the same render; check them together so the
      // mocked response cannot re-enable the button between the two asserts.
      await waitFor(() => {
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("aria-busy", "true");
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(detail);
      expect(button).toBeEnabled();
    },
  );

  test("AC-AUTH-022 lỗi từng ô: kiểm ở client trước khi gửi, và lỗi 422 của server hiện dưới ô", async () => {
    let requests = 0;
    server.use(
      http.post("/api/v1/auth/login", () => {
        requests += 1;
        return problem(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", [
          {
            field: "username",
            code: "string_too_long",
            message: "String should have at most 254 characters",
          },
        ]);
      }),
    );
    renderApp("/dang-nhap");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Đăng nhập" }));
    const email = screen.getByLabelText("Tên đăng nhập");
    expect(await screen.findByText("Vui lòng nhập tên đăng nhập.")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập mật khẩu.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(requests).toBe(0);

    await user.type(email, "an.nv");
    await user.type(screen.getByLabelText("Mật khẩu"), "SmYou@2026");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText("Giá trị không hợp lệ.")).toBeInTheDocument();
    expect(requests).toBe(1);
  });

  test.each([
    ["/dang-nhap?next=%2F", "/"],
    ["/dang-nhap?next=https%3A%2F%2Fevil.example%2F", "/"],
    ["/dang-nhap", "/"],
  ])("AC-AUTH-023 đăng nhập thành công từ %s → %s", async (start, expected) => {
    mockDashboardApis();
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json({ employee: AN, must_change_password: false }),
      ),
    );
    const router = renderApp(start);
    const user = await fillLogin("an.nguyen@smyou.vn", "SmYou@2026");

    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(expected);
  });

  test("AC-AUTH-052 có link Quên mật khẩu? dưới ô Mật khẩu, trỏ /quen-mat-khau, vùng chạm ≥44px", async () => {
    renderApp("/dang-nhap");
    const link = await screen.findByRole("link", { name: "Quên mật khẩu?" });
    expect(link).toHaveAttribute("href", "/quen-mat-khau");
    expect(link.className).toContain("min-h-11");
  });
});

describe("Đổi mật khẩu lần đầu", () => {
  test("AC-AUTH-024 phải đổi mật khẩu → bị giữ ở /doi-mat-khau; đổi xong → toast và về trang chủ", async () => {
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json({ employee: KHOA, must_change_password: true }),
      ),
      http.post("/api/v1/auth/change-password", () => new HttpResponse(null, { status: 204 })),
    );
    const router = renderApp("/dang-nhap?next=%2F");
    const user = await fillLogin("khoa.tran@smyou.vn", "TamThoi#14");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("heading", { name: "Đổi mật khẩu" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/doi-mat-khau");

    await router.navigate("/");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/doi-mat-khau");
    });

    await user.type(screen.getByLabelText("Mật khẩu hiện tại"), "TamThoi#14");
    await user.type(screen.getByLabelText("Mật khẩu mới"), "Khoa@SmYou9");
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "Khoa@SmYou9");
    await user.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Đã đổi mật khẩu.");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  test("AC-AUTH-024 nhập lại không khớp và lỗi mật khẩu hiện tại của server hiện dưới đúng ô", async () => {
    let requests = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({ employee: KHOA, must_change_password: true }),
      ),
      http.post("/api/v1/auth/change-password", () => {
        requests += 1;
        return problem(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", [
          { field: "current_password", code: "invalid", message: "Mật khẩu hiện tại không đúng." },
        ]);
      }),
    );
    markSignedIn();
    renderApp("/doi-mat-khau");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Mật khẩu hiện tại"), "sai");
    await user.type(screen.getByLabelText("Mật khẩu mới"), "Khoa@SmYou9");
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "Khoa@SmYou8");
    await user.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
    expect(await screen.findByText("Mật khẩu nhập lại không khớp.")).toBeInTheDocument();
    expect(requests).toBe(0);

    const confirm = screen.getByLabelText("Nhập lại mật khẩu mới");
    await user.clear(confirm);
    await user.type(confirm, "Khoa@SmYou9");
    await user.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
    const current = screen.getByLabelText("Mật khẩu hiện tại");
    await waitFor(() => expect(current).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Mật khẩu hiện tại không đúng.")).toBeInTheDocument();
  });
});

describe("Phiên đăng nhập", () => {
  test("AC-AUTH-021 từng đăng nhập → khôi phục phiên bằng refresh, không phải đăng nhập lại", async () => {
    mockDashboardApis();
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({ employee: AN, must_change_password: false }),
      ),
    );
    markSignedIn();
    const router = renderApp("/");

    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  test("AC-AUTH-026 đăng xuất → về trang đăng nhập, không quay lại được trang cần đăng nhập", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({ employee: AN, must_change_password: false }),
      ),
      http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
    );
    markSignedIn();
    const router = renderApp("/");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Đăng xuất" }));

    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dang-nhap");
    await router.navigate(-1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dang-nhap");
    });
    expect(within(document.body).queryByText(/Nguyễn Văn An/)).not.toBeInTheDocument();
  });
});

describe("AC-UI-037 khung thẻ đăng nhập bỏ viền", () => {
  test("section gốc có shadow-card, p-7, không còn border; ô nhập vẫn giữ viền; đăng nhập vẫn hoạt động", async () => {
    mockDashboardApis();
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json({ employee: AN, must_change_password: false }),
      ),
    );
    renderApp("/dang-nhap");

    await screen.findByLabelText("Tên đăng nhập");
    const section = screen.getByRole("main").querySelector("section") as HTMLElement;
    expect(section.className).toContain("shadow-card");
    expect(section.className).toContain("p-7");
    expect(section.className).not.toMatch(/\bborder\b/);
    expect(screen.getByLabelText("Tên đăng nhập").className).toContain("border-line");
    expect(screen.getByLabelText("Mật khẩu").className).toContain("border-line");

    const user = await fillLogin("an.nguyen@smyou.vn", "SmYou@2026");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeInTheDocument();
  });
});

describe("AC-UI-038 khung thẻ đổi mật khẩu bỏ viền", () => {
  test("forced=true: section bỏ viền, giữ viền 3 ô mật khẩu, nút Đăng xuất hiện", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({ employee: AN, must_change_password: true }),
      ),
    );
    markSignedIn();
    renderApp("/doi-mat-khau");

    await screen.findByLabelText("Mật khẩu hiện tại");
    const section = screen.getByRole("main").querySelector("section") as HTMLElement;
    expect(section.className).toContain("shadow-card");
    expect(section.className).toContain("p-7");
    expect(section.className).not.toMatch(/\bborder\b/);
    expect(screen.getByLabelText("Mật khẩu hiện tại").className).toContain("border-line");
    expect(screen.getByLabelText("Mật khẩu mới").className).toContain("border-line");
    expect(screen.getByLabelText("Nhập lại mật khẩu mới").className).toContain("border-line");
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });

  test("forced=false: section bỏ viền, nút Huỷ hiện thay cho Đăng xuất", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({ employee: AN, must_change_password: false }),
      ),
    );
    markSignedIn();
    renderApp("/doi-mat-khau");

    await screen.findByLabelText("Mật khẩu hiện tại");
    const section = screen.getByRole("main").querySelector("section") as HTMLElement;
    expect(section.className).toContain("shadow-card");
    expect(section.className).toContain("p-7");
    expect(section.className).not.toMatch(/\bborder\b/);
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();
  });
});

const GENERIC_RESET_DETAIL =
  "Nếu email tồn tại và tài khoản đang hoạt động, chúng tôi đã gửi email hướng dẫn đặt lại mật khẩu.";

describe("Trang Quên mật khẩu", () => {
  test("AC-AUTH-053 gửi thành công → thay form bằng thông báo của server + nút về đăng nhập", async () => {
    server.use(
      http.post("/api/v1/auth/forgot-password", () =>
        HttpResponse.json({ detail: GENERIC_RESET_DETAIL }),
      ),
    );
    renderApp("/quen-mat-khau");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Email"), "an.nguyen@smyou.vn");
    await user.click(screen.getByRole("button", { name: "Gửi liên kết" }));

    expect(await screen.findByText(GENERIC_RESET_DETAIL)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang đăng nhập" })).toHaveAttribute(
      "href",
      "/dang-nhap",
    );
  });

  test("AC-AUTH-054 email không tồn tại → hiện y hệt lúc gửi thành công", async () => {
    server.use(
      http.post("/api/v1/auth/forgot-password", () =>
        HttpResponse.json({ detail: GENERIC_RESET_DETAIL }),
      ),
    );
    renderApp("/quen-mat-khau");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Email"), "ai.do@smyou.vn");
    await user.click(screen.getByRole("button", { name: "Gửi liên kết" }));

    expect(await screen.findByText(GENERIC_RESET_DETAIL)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang đăng nhập" })).toBeInTheDocument();
  });

  test("AC-AUTH-055 email rỗng/sai định dạng → lỗi dưới ô, không gọi API", async () => {
    let requests = 0;
    server.use(
      http.post("/api/v1/auth/forgot-password", () => {
        requests += 1;
        return HttpResponse.json({ detail: GENERIC_RESET_DETAIL });
      }),
    );
    renderApp("/quen-mat-khau");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Gửi liên kết" }));
    expect(await screen.findByText("Vui lòng nhập email.")).toBeInTheDocument();
    expect(requests).toBe(0);

    await user.type(screen.getByLabelText("Email"), "khong-phai-email");
    await user.click(screen.getByRole("button", { name: "Gửi liên kết" }));
    expect(await screen.findByText("Email không hợp lệ.")).toBeInTheDocument();
    expect(requests).toBe(0);
  });

  test("AC-AUTH-056 429 → Alert hiện đúng detail của server, form vẫn còn", async () => {
    server.use(
      http.post("/api/v1/auth/forgot-password", () =>
        problem(429, "TOO_MANY_REQUESTS", "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau."),
      ),
    );
    renderApp("/quen-mat-khau");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Email"), "an.nguyen@smyou.vn");
    await user.click(screen.getByRole("button", { name: "Gửi liên kết" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.",
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  test("có link Quay lại đăng nhập ngay trên form (chưa gửi)", async () => {
    renderApp("/quen-mat-khau");
    const link = await screen.findByRole("link", { name: "Quay lại đăng nhập" });
    expect(link).toHaveAttribute("href", "/dang-nhap");
  });
});

const INVALID_LINK_MESSAGE = "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.";

describe("Trang Đặt lại mật khẩu", () => {
  test("AC-AUTH-057 không có token → EmptyState liên kết không hợp lệ + nút Gửi lại yêu cầu", async () => {
    renderApp("/reset-password");

    expect(await screen.findByText(INVALID_LINK_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gửi lại yêu cầu" })).toHaveAttribute(
      "href",
      "/quen-mat-khau",
    );
    expect(screen.queryByLabelText("Mật khẩu mới")).not.toBeInTheDocument();
  });

  test("AC-AUTH-057 token rỗng → cùng EmptyState", async () => {
    renderApp("/reset-password?token=");

    expect(await screen.findByText(INVALID_LINK_MESSAGE)).toBeInTheDocument();
  });

  test("AC-AUTH-058 có token → hiện form 2 ô mật khẩu mới + gợi ý quy tắc", async () => {
    renderApp("/reset-password?token=abc123");

    expect(await screen.findByLabelText("Mật khẩu mới")).toBeInTheDocument();
    expect(screen.getByLabelText("Nhập lại mật khẩu mới")).toBeInTheDocument();
    expect(
      screen.getByText("Ít nhất 8 ký tự, khác mật khẩu hiện tại, không chứa tên email."),
    ).toBeInTheDocument();
  });

  test("AC-AUTH-059 submit hợp lệ → toast, xoá session cục bộ, về /dang-nhap", async () => {
    server.use(
      http.post("/api/v1/auth/reset-password", () => new HttpResponse(null, { status: 204 })),
    );
    markSignedIn();
    const router = renderApp("/reset-password?token=abc123");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Mật khẩu mới"), "Khoa@SmYou9");
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "Khoa@SmYou9");
    await user.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.",
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dang-nhap");
    });
    expect(hasSignedIn()).toBe(false);
  });

  test("AC-AUTH-060 nhập lại không khớp → lỗi dưới ô xác nhận, không gọi API", async () => {
    let requests = 0;
    server.use(
      http.post("/api/v1/auth/reset-password", () => {
        requests += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp("/reset-password?token=abc123");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Mật khẩu mới"), "Khoa@SmYou9");
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "Khac@SmYou9");
    await user.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));

    expect(await screen.findByText("Mật khẩu nhập lại không khớp.")).toBeInTheDocument();
    expect(requests).toBe(0);
  });

  test("AC-AUTH-061 token đã dùng/hết hạn khi submit → chuyển sang EmptyState liên kết không hợp lệ", async () => {
    server.use(
      http.post("/api/v1/auth/reset-password", () =>
        problem(422, "INVALID_RESET_TOKEN", INVALID_LINK_MESSAGE),
      ),
    );
    renderApp("/reset-password?token=abc123");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Mật khẩu mới"), "Khoa@SmYou9");
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "Khoa@SmYou9");
    await user.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));

    expect(await screen.findByText(INVALID_LINK_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gửi lại yêu cầu" })).toBeInTheDocument();
  });

  test("AC-AUTH-062 mật khẩu mới yếu/trùng mật khẩu hiện tại → lỗi dưới ô, giữ form + token", async () => {
    server.use(
      http.post("/api/v1/auth/reset-password", () =>
        problem(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", [
          {
            field: "new_password",
            code: "invalid",
            message: "Mật khẩu mới phải khác mật khẩu hiện tại.",
          },
        ]),
      ),
    );
    renderApp("/reset-password?token=abc123");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Mật khẩu mới"), "SmYou@2026");
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "SmYou@2026");
    await user.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));

    expect(
      await screen.findByText("Mật khẩu mới phải khác mật khẩu hiện tại."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu mới")).toBeInTheDocument();
  });
});

describe("M17-03b đăng nhập bằng tên đăng nhập", () => {
  test("AC-AUTH-072 ô Tên đăng nhập thay Email, autocomplete=username, bỏ trống → báo lỗi, gửi username", async () => {
    let body: Record<string, unknown> | null = null;
    mockDashboardApis();
    server.use(
      http.post("/api/v1/auth/login", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ employee: AN, must_change_password: false });
      }),
    );
    renderApp("/dang-nhap");

    const username = await screen.findByLabelText("Tên đăng nhập");
    expect(username).toHaveAttribute("autocomplete", "username");
    expect(username).not.toHaveAttribute("type", "email");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Mật khẩu"), "SmYou@2026");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText("Vui lòng nhập tên đăng nhập.")).toBeInTheDocument();
    expect(body).toBeNull();

    await user.type(username, "an.nv");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() => {
      expect(body).toEqual({ username: "an.nv", password: "SmYou@2026" });
    });
  });
});
