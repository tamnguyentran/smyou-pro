import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const ACCOUNTS = {
  manager: "an.e2e@smyou.vn",
  sale: "hoa.e2e@smyou.vn",
  "tech-lead": "tuan.lead@smyou.vn",
  technician: "khoa.shell@smyou.vn",
  "sale-technician": "ha.e2e@smyou.vn",
} as const;
type Role = keyof typeof ACCOUNTS;
const SLOTS: Record<Role, string[]> = {
  manager: ["Tổng quan", "Đơn hàng", "Tạo đơn", "Thông báo", "Cá nhân"],
  sale: ["Tổng quan", "Đơn hàng", "Tạo đơn", "Thông báo", "Cá nhân"],
  "tech-lead": ["Tổng quan", "Bảng đầu việc", "Tạo đầu việc", "Thông báo", "Cá nhân"],
  technician: ["Tổng quan", "Việc của tôi", "Thông báo", "Cá nhân"],
  "sale-technician": ["Tổng quan", "Đơn hàng", "Tạo đơn", "Thông báo", "Cá nhân"],
};
const isMobile = (info: TestInfo) => info.project.name === "mobile";

async function signIn(page: Page, role: Role, path = "/") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(ACCOUNTS[role]);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  for (const width of [page.viewportSize()?.width ?? 390, 360]) {
    await page.setViewportSize({ width, height: 780 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file),
    fullPage: true,
  });
}

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  test(`AC-SYS-047 AC-SYS-051 @a11y @screenshot thanh dưới đáy của ${role}`, async ({
    page,
  }, info) => {
    await signIn(page, role);
    const nav = page.getByRole("navigation", { name: "Điều hướng nhanh" });
    if (!isMobile(info)) {
      await expect(page.getByRole("navigation", { name: "Menu chính" })).toBeVisible();
      await expect(nav).toHaveCount(0); // AC-SYS-048: hidden ≥ 1024px
      return;
    }
    await expect(nav.getByRole("link").first()).toBeVisible();
    await expect(nav.getByRole("link")).toHaveText(SLOTS[role]);
    for (const link of await nav.getByRole("link").all()) {
      expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await evidence(page, info, `bottom-nav-${role}.png`);
  });
}

test("AC-SYS-048 ô đang chọn và nội dung không bị che", async ({ page }, info) => {
  await signIn(page, "sale", "/orders");
  await expect(page.getByText("Tính năng đang được phát triển.")).toBeVisible();
  if (isMobile(info)) {
    const nav = page.getByRole("navigation", { name: "Điều hướng nhanh" });
    await expect(nav.getByRole("link", { name: "Đơn hàng" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const navTop = (await nav.boundingBox())?.y ?? 0;
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    const home = page.getByRole("main").getByRole("link", { name: "Về trang chủ" });
    const box = await home.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(navTop);
  } else {
    await expect(page.getByRole("navigation", { name: "Điều hướng nhanh" })).toHaveCount(0);
  }
});

test("AC-SYS-049 AC-SYS-051 @a11y @screenshot trang Cá nhân", async ({ page }, info) => {
  await signIn(page, "sale-technician", "/ca-nhan");
  const main = page.getByRole("main");
  await expect(page.getByRole("heading", { level: 1, name: "Cá nhân" })).toBeVisible();
  await expect(main.getByText("Phạm Thu Hà")).toBeVisible();
  await expect(main.getByText("ha.e2e@smyou.vn")).toBeVisible();
  await expect(main.getByText("Nhân viên kinh doanh · Nhân viên kỹ thuật")).toBeVisible();
  await evidence(page, info, "profile.png");

  await main.getByRole("link", { name: "Đổi mật khẩu" }).click();
  await expect(page.getByText("Đặt mật khẩu mới cho tài khoản của bạn.")).toBeVisible();
  await page.getByRole("button", { name: "Huỷ" }).click();
  await expect(page).toHaveURL(/\/smyoutask\/ca-nhan$/);

  await main.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/smyoutask\/dang-nhap/);
});
