import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import * as webPush from "../notifications/webPush";

const id = "7d1f0c2e-0000-4000-8000-000000000061";

function signedInWithProfile(overrides: Record<string, unknown> = {}) {
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
        capabilities: { "profile.manage": ["self"] },
        counters: {},
        unread_notifications_count: 0,
        vapid_public_key: null,
        ...overrides,
      }),
    ),
  );
  markSignedIn();
}

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

function fakeSubscription(endpoint: string): PushSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "p1", auth: "a1" } }),
    unsubscribe: () => Promise.resolve(true),
  } as unknown as PushSubscription;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Trang /ca-nhan", () => {
  test("AC-NTF-033 thiếu profile.manage → ForbiddenPage", async () => {
    signedInWithoutProfileManage();
    renderApp("/ca-nhan");
    expect(await screen.findByText(/Bạn không có quyền/)).toBeInTheDocument();
  });

  test("AC-NTF-045 server chưa cấu hình VAPID → không hiện nút Web Push", async () => {
    signedInWithProfile({ vapid_public_key: null });
    renderApp("/ca-nhan");
    await screen.findByText("Trần Minh Khoa");
    expect(screen.queryByText(/thông báo trên thiết bị này/)).not.toBeInTheDocument();
  });

  test("AC-NTF-046 trình duyệt không hỗ trợ Push → không hiện nút", async () => {
    vi.spyOn(webPush, "isPushSupported").mockReturnValue(false);
    signedInWithProfile({ vapid_public_key: "test-public-key" });
    renderApp("/ca-nhan");
    await screen.findByText("Trần Minh Khoa");
    expect(screen.queryByText(/thông báo trên thiết bị này/)).not.toBeInTheDocument();
  });

  test("AC-NTF-047 chưa đăng ký → bấm 'Nhận thông báo' gọi subscribe, đổi thành 'Tắt thông báo'", async () => {
    vi.spyOn(webPush, "isPushSupported").mockReturnValue(true);
    vi.spyOn(webPush, "getCurrentSubscription").mockResolvedValue(null);
    const subscription = fakeSubscription("https://push.example/khoa");
    vi.spyOn(webPush, "subscribeToPush").mockResolvedValue(subscription);
    let subscribeBody: unknown;
    server.use(
      http.post("/api/v1/notifications/push-subscriptions", async ({ request }) => {
        subscribeBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    signedInWithProfile({ vapid_public_key: "test-public-key" });
    renderApp("/ca-nhan");

    const button = await screen.findByRole("button", { name: "Nhận thông báo trên thiết bị này" });
    await userEvent.setup().click(button);

    await screen.findByRole("button", { name: "Tắt thông báo trên thiết bị này" });
    expect(subscribeBody).toEqual({
      endpoint: "https://push.example/khoa",
      keys: { p256dh: "p1", auth: "a1" },
    });
  });

  test("AC-NTF-048 đã đăng ký → bấm 'Tắt thông báo' gọi unsubscribe, đổi lại 'Nhận thông báo'", async () => {
    vi.spyOn(webPush, "isPushSupported").mockReturnValue(true);
    const subscription = fakeSubscription("https://push.example/khoa2");
    vi.spyOn(webPush, "getCurrentSubscription").mockResolvedValue(subscription);
    const unsubscribeSpy = vi.spyOn(webPush, "unsubscribeFromPush").mockResolvedValue();
    let unsubscribeBody: unknown;
    server.use(
      http.post("/api/v1/notifications/push-subscriptions/unsubscribe", async ({ request }) => {
        unsubscribeBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    signedInWithProfile({ vapid_public_key: "test-public-key" });
    renderApp("/ca-nhan");

    const button = await screen.findByRole("button", { name: "Tắt thông báo trên thiết bị này" });
    await userEvent.setup().click(button);

    await screen.findByRole("button", { name: "Nhận thông báo trên thiết bị này" });
    expect(unsubscribeBody).toEqual({ endpoint: "https://push.example/khoa2" });
    expect(unsubscribeSpy).toHaveBeenCalledWith(subscription);
  });
});

describe("AC-UI-039 AC-UI-040 khung thẻ hồ sơ cá nhân bỏ viền", () => {
  test("có dữ liệu /me: section bỏ viền, giữ shadow-card; link Đổi mật khẩu vẫn giữ viền; Đăng xuất hoạt động", async () => {
    signedInWithProfile();
    renderApp("/ca-nhan");

    await screen.findByText("Trần Minh Khoa");
    const section = screen.getByRole("main").querySelector("section") as HTMLElement;
    expect(section.className).toContain("shadow-card");
    expect(section.className).not.toMatch(/\bborder\b/);
    const changePasswordLink = within(section).getByRole("link", { name: /Đổi mật khẩu/ });
    expect(changePasswordLink.className).toContain("border-line");
    expect(within(section).getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });

  test("đang tải /me: khung section vẫn đúng style, nội dung skeleton không đổi", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({
          employee: { id, code: "NV014", full_name: "Trần Minh Khoa", roles: ["TECHNICIAN"] },
          must_change_password: false,
        }),
      ),
      http.get("/api/v1/me", () => new Promise(() => {})),
    );
    markSignedIn();
    renderApp("/ca-nhan");

    await screen.findByRole("heading", { level: 1, name: "Cá nhân" });
    const section = screen.getByRole("main").querySelector("section") as HTMLElement;
    expect(section.className).toContain("shadow-card");
    expect(section.className).not.toMatch(/\bborder\b/);
    expect(section.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  test("lỗi /me: khung section vẫn đúng style, hiện MeError với nút Thử lại", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () =>
        HttpResponse.json({
          employee: { id, code: "NV014", full_name: "Trần Minh Khoa", roles: ["TECHNICIAN"] },
          must_change_password: false,
        }),
      ),
      http.get("/api/v1/me", () => HttpResponse.json({ status: 503 }, { status: 503 })),
    );
    markSignedIn();
    renderApp("/ca-nhan");

    await screen.findByText("Không tải được thông tin tài khoản.");
    const section = screen.getByRole("main").querySelector("section") as HTMLElement;
    expect(section.className).toContain("shadow-card");
    expect(section.className).not.toMatch(/\bborder\b/);
    expect(within(section).getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });
});

describe("ProfilePage — thông tin cá nhân (M17-03a)", () => {
  const profileEmployee = {
    id,
    code: "NV014",
    full_name: "Trần Minh Khoa",
    email: null,
    title: null,
    department: { id: "d1", name: "Kỹ thuật" },
    phone: "0932068787",
    birth_date: "1985-07-30",
    birth_place: "An Giang",
    gender: "FEMALE",
    address: "12 Trần Hưng Đạo, Long Xuyên, An Giang",
    id_number: "089185000565",
    id_issued_date: "2018-10-08",
    id_issued_place: null,
    marital_status: "MARRIED",
  };

  function row(label: string): string {
    const dt = screen.getByText(label, { selector: "dt" });
    return dt.nextElementSibling?.textContent ?? "";
  }

  test("AC-EMP-073 trang Cá nhân hiện SĐT + 8 trường mới, trống → '—', chỉ xem", async () => {
    signedInWithProfile({ employee: profileEmployee });
    renderApp("/ca-nhan");
    await screen.findByText("Ngày sinh", { selector: "dt" });

    expect(row("SĐT")).toBe("0932068787");
    expect(row("Ngày sinh")).toBe("30/07/1985");
    expect(row("Nơi sinh")).toBe("An Giang");
    expect(row("Giới tính")).toBe("Nữ");
    expect(row("Địa chỉ")).toBe("12 Trần Hưng Đạo, Long Xuyên, An Giang");
    expect(row("CMND/CCCD")).toBe("089185000565");
    expect(row("Ngày cấp")).toBe("08/10/2018");
    expect(row("Nơi cấp")).toBe("—");
    expect(row("Tình trạng hôn nhân")).toBe("Đã kết hôn");
    expect(row("Email")).toBe("—");
    expect(screen.getByRole("main").querySelector("input, select, textarea")).toBeNull();
  });
});
