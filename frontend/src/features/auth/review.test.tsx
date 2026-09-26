import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { api } from "../../lib/api";
import { hasSignedIn, markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";

const AN = {
  id: "7d1f0c2e-0000-4000-8000-000000000001",
  code: "NV001",
  full_name: "Nguyễn Văn An",
  roles: ["MANAGER"],
};
const problem = (status: number, code: string, detail: string, errors?: unknown[]) =>
  HttpResponse.json({ status, code, detail, ...(errors ? { errors } : {}) }, { status });

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Mật khẩu"), password);
  return user;
}

describe("Review M1-01b — phiên", () => {
  test("AC-AUTH-025 refresh bị từ chối giữa chừng → về /dang-nhap với next = trang hiện tại, xoá dấu đăng nhập", async () => {
    let refreshes = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => {
        refreshes += 1;
        return refreshes === 1
          ? HttpResponse.json({ employee: AN, must_change_password: false })
          : problem(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.");
      }),
      http.get("/api/v1/health", () => problem(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.")),
    );
    markSignedIn();
    const router = renderApp("/?tab=lich-su");
    expect(await screen.findByText("Xin chào, Nguyễn Văn An")).toBeInTheDocument();

    await api.GET("/api/v1/health");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dang-nhap");
    });
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe("/?tab=lich-su");
    expect(hasSignedIn()).toBe(false);
  });

  test("AC-AUTH-021 từng đăng nhập nhưng phiên đã hết → trang đăng nhập và xoá dấu", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        problem(401, "UNAUTHENTICATED", "Vui lòng đăng nhập."),
      ),
    );
    markSignedIn();
    const router = renderApp("/");

    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dang-nhap");
    expect(hasSignedIn()).toBe(false);
  });

  test("AC-AUTH-025 phiên mới sau khi tự làm mới cập nhật giao diện (vd phải đổi mật khẩu)", async () => {
    let refreshes = 0;
    let healthCalls = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => {
        refreshes += 1;
        return HttpResponse.json({ employee: AN, must_change_password: refreshes > 1 });
      }),
      http.get("/api/v1/health", () => {
        healthCalls += 1;
        return healthCalls === 1
          ? problem(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.")
          : HttpResponse.json({ status: "ok", database: "ok", version: "1" });
      }),
    );
    markSignedIn();
    const router = renderApp("/");
    expect(await screen.findByText("Xin chào, Nguyễn Văn An")).toBeInTheDocument();

    await api.GET("/api/v1/health");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/doi-mat-khau");
    });
  });
});

describe("Review M1-01b — đăng nhập", () => {
  test("AC-AUTH-023 next nội bộ khác trang chủ được dùng thật", async () => {
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json({ employee: AN, must_change_password: false }),
      ),
    );
    const router = renderApp("/dang-nhap?next=%2Fdoi-mat-khau");
    const user = await fillLogin("an.nguyen@smyou.vn", "SmYou@2026");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("heading", { name: "Đổi mật khẩu" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/doi-mat-khau");
  });

  test("AC-AUTH-022 lỗi 422 của server nằm dưới ô (không ở khung lỗi chung) và bấm đôi chỉ gửi 1 lần", async () => {
    let requests = 0;
    server.use(
      http.post("/api/v1/auth/login", async () => {
        requests += 1;
        await delay(50);
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
    const user = await fillLogin("an.nguyen@smyou.vn", "SmYou@2026");
    const button = screen.getByRole("button", { name: "Đăng nhập" });

    await user.dblClick(button);
    await user.keyboard("{Enter}");

    const email = screen.getByLabelText("Email");
    await waitFor(() => {
      expect(email).toHaveAccessibleDescription("Giá trị không hợp lệ.");
    });
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(requests).toBe(1);
  });

  test("AC-AUTH-022 lỗi 422 không gắn được vào ô nào → hiện ở khung lỗi chung", async () => {
    server.use(
      http.post("/api/v1/auth/login", () =>
        problem(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", [
          { field: "body", code: "json_invalid" },
        ]),
      ),
    );
    renderApp("/dang-nhap");
    const user = await fillLogin("an.nguyen@smyou.vn", "SmYou@2026");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Dữ liệu không hợp lệ.");
  });
});

describe("Review M1-01b — đổi mật khẩu, đăng xuất", () => {
  test("AC-AUTH-024 lỗi quy tắc của server cho mật khẩu mới hiện dưới ô mới, gợi ý vẫn còn", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({ employee: AN, must_change_password: true }),
      ),
      http.post("/api/v1/auth/change-password", () =>
        problem(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", [
          {
            field: "new_password",
            code: "invalid",
            message: "Mật khẩu không được chứa tên email.",
          },
        ]),
      ),
    );
    markSignedIn();
    renderApp("/doi-mat-khau");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Mật khẩu hiện tại"), "TamThoi#14");
    await user.type(screen.getByLabelText("Mật khẩu mới"), "an.nguyen-2026");
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "an.nguyen-2026");
    await user.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));

    const field = screen.getByLabelText("Mật khẩu mới");
    await waitFor(() => {
      expect(field).toHaveAttribute("aria-invalid", "true");
    });
    expect(field).toHaveAccessibleDescription(
      "Mật khẩu không được chứa tên email. Ít nhất 8 ký tự, khác mật khẩu hiện tại, không chứa tên email.",
    );
  });

  test("AC-AUTH-026 đăng xuất thất bại (lỗi mạng/5xx) → báo lỗi, vẫn giữ phiên", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({ employee: AN, must_change_password: false }),
      ),
      http.post("/api/v1/auth/logout", () => HttpResponse.json({ status: 503 }, { status: 503 })),
    );
    markSignedIn();
    const router = renderApp("/");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Đăng xuất" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không đăng xuất được. Vui lòng thử lại.",
    );
    expect(router.state.location.pathname).toBe("/");
    expect(hasSignedIn()).toBe(true);
  });

  test("AC-AUTH-024 trang đổi mật khẩu bắt buộc có nút Đăng xuất (đổi tài khoản)", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({ employee: AN, must_change_password: true }),
      ),
      http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
    );
    markSignedIn();
    const router = renderApp("/doi-mat-khau");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Đăng xuất" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dang-nhap");
    });
  });

  test("AC-AUTH-027 tiêu đề tab theo từng trang", async () => {
    renderApp("/dang-nhap");
    await screen.findByRole("heading", { name: "Đăng nhập" });
    expect(document.title).toBe("Đăng nhập · SMYou Pro");
  });
});
