import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Review M1-01b: evidence for the signed-in home and the forced first-login screen.
const MANAGER = { email: "an.e2e@smyou.vn", password: "E2e@SmYou2026", name: "Nguyễn Văn An" };
const firstLogin = (info: TestInfo) => ({
  email: `tuan.${info.project.name}@smyou.vn`,
  password: "TamThoi#E2E1",
});

async function login(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

/** M1-03: on phones "Đăng xuất" sits in the slide-out menu (AC-SYS-040). */
async function openMenuOnPhone(page: Page) {
  const open = page.getByRole("button", { name: "Mở menu" });
  if (await open.isVisible()) await open.click();
}

async function checkPage(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.impact ?? ""} ${v.id}`)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file),
    fullPage: true,
  });
}

test("AC-AUTH-027 @a11y @screenshot trang chủ đã đăng nhập", async ({ page }, info) => {
  await page.goto("./dang-nhap");
  await login(page, MANAGER.email, MANAGER.password);
  await expect(page.getByText(`Xin chào, ${MANAGER.name}`)).toBeVisible();
  await openMenuOnPhone(page);
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  await checkPage(page, info, "home-signed-in.png");
});

test("AC-AUTH-027 @a11y @screenshot màn đổi mật khẩu lần đầu", async ({ page }, info) => {
  const account = firstLogin(info);
  await page.goto("./dang-nhap");
  await login(page, account.email, account.password);
  await expect(page).toHaveURL(/\/smyoutask\/doi-mat-khau$/);
  await expect(
    page.getByText("Đây là lần đăng nhập đầu tiên. Hãy đặt mật khẩu mới chỉ bạn biết."),
  ).toBeVisible();
  await checkPage(page, info, "change-password-first-login.png");
});

test("AC-AUTH-026 đăng xuất thu hồi phiên ở server", async ({ page }) => {
  await page.goto("./dang-nhap");
  await login(page, MANAGER.email, MANAGER.password);
  await expect(page.getByText(`Xin chào, ${MANAGER.name}`)).toBeVisible();

  await openMenuOnPhone(page);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/smyoutask\/dang-nhap/);

  const refresh = await page.request.post("api/v1/auth/refresh");
  expect(refresh.status()).toBe(401);
});
