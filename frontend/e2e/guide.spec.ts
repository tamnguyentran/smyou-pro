import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/") {
  await page.goto("./dang-nhap");
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // UAT-05: sign-in always lands on Tổng quan; then open the page under test.
  await page.waitForURL(/\/smyoutask\/$/);
  await page.goto(`.${path}`);
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("AC-HELP-001 nút ? cạnh chuông (≥44px) mở Hướng dẫn sử dụng; trang đăng nhập không có", async ({
  page,
}) => {
  await page.goto("./dang-nhap");
  await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hướng dẫn sử dụng" })).toHaveCount(0);

  await signIn(page, SALE);
  const help = page.getByRole("banner").getByRole("link", { name: "Hướng dẫn sử dụng" });
  await expect(help).toBeVisible();
  const box = await help.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await help.click();
  await expect(page).toHaveURL(/\/huong-dan$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hướng dẫn sử dụng" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Hướng dẫn Nhân viên kinh doanh" })).toBeVisible();
});

test("AC-HELP-013 @a11y @screenshot Hướng dẫn sử dụng: 5 tab, mục lục thu gọn trên điện thoại", async ({
  page,
}, info) => {
  await signIn(page, MANAGER, "/huong-dan");
  const tablist = page.getByRole("tablist", { name: "Vai trò" });
  await expect(tablist.getByRole("tab")).toHaveCount(5);
  await expect(page.getByRole("region", { name: "Hướng dẫn Quản lý chung" })).toBeVisible();

  const toc = page
    .getByRole("region", { name: "Hướng dẫn Quản lý chung" })
    .getByRole("navigation", { name: "Mục lục" });
  if (info.project.name === "mobile") {
    // Thanh tab cuộn ngang bên trong, không đẩy rộng trang; mục lục gói trong <details>.
    expect(
      await tablist.evaluate(
        (el) => getComputedStyle(el).overflowX === "auto" && el.scrollWidth > el.clientWidth,
      ),
    ).toBe(true);
    await expect(toc).toBeHidden();
    await page.getByText("Mục lục", { exact: true }).click();
    await expect(toc).toBeVisible();
  } else {
    await expect(toc).toBeVisible();
    expect(await toc.evaluate((el) => getComputedStyle(el.parentElement ?? el).position)).toBe(
      "sticky",
    );
  }
  await noHorizontalScroll(page);

  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, "guide-manager.png") });

  await tablist.getByRole("tab", { name: "Nhân viên kỹ thuật" }).click();
  await expect(page).toHaveURL(/vai-tro=TECHNICIAN/);
  await expect(page.getByRole("region", { name: "Hướng dẫn Nhân viên kỹ thuật" })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: shot(info, "guide-technician.png") });
});
