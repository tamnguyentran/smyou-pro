import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
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

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Mật khẩu"), password);
  return user;
}

describe("Trang đăng nhập", () => {
  test("AC-AUTH-021 chưa đăng nhập → chuyển tới /dang-nhap?next=, form đủ nhãn, không gọi API khi chưa từng đăng nhập", async () => {
    const router = renderApp("/");

    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dang-nhap");
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe("/");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    const password = screen.getByLabelText("Mật khẩu");
    expect(password).toHaveAttribute("type", "password");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Hiện mật khẩu" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ẩn mật khẩu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
  });

  test.each([
    [401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng."],
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
      await waitFor(() => expect(button).toBeDisabled());
      expect(button).toHaveAttribute("aria-busy", "true");

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
            field: "email",
            code: "string_pattern_mismatch",
            message: "String should match pattern",
          },
        ]);
      }),
    );
    renderApp("/dang-nhap");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Email"), "khong-phai-email");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    const email = screen.getByLabelText("Email");
    expect(await screen.findByText("Email không hợp lệ.")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập mật khẩu.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(requests).toBe(0);

    await user.clear(email);
    await user.type(email, "an.nguyen@smyou.vn");
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
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json({ employee: AN, must_change_password: false }),
      ),
    );
    const router = renderApp(start);
    const user = await fillLogin("an.nguyen@smyou.vn", "SmYou@2026");

    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText(/Nguyễn Văn An/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(expected);
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
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({ employee: AN, must_change_password: false }),
      ),
    );
    markSignedIn();
    const router = renderApp("/");

    expect(await screen.findByText(/Nguyễn Văn An/)).toBeInTheDocument();
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
