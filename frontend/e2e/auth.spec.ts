import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const MANAGER = { email: "an.e2e@smyou.vn", password: "E2e@SmYou2026", name: "Nguyễn Văn An" };
const technician = (info: TestInfo) => ({
  email: `khoa.${info.project.name}@smyou.vn`,
  password: "TamThoi#E2E1",
});

async function login(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

/** M1-03: on phones "Đăng xuất" sits in the slide-out menu (AC-SYS-040). */
async function openMenuOnPhone(page: Page) {
  const open = page.getByRole("button", { name: "Mở menu" });
  if (await open.isVisible()) await open.click();
}

function shot(info: TestInfo, name: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, name);
}

test("AC-AUTH-021 chưa đăng nhập → trang đăng nhập với next, nút cao ≥ 44px", async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveURL(/\/smyoutask\/dang-nhap\?next=%2F$/);
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  const box = await page.getByRole("button", { name: "Đăng nhập" }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("AC-AUTH-023 đăng nhập thật qua API dưới /smyoutask → về trang đích", async ({ page }) => {
  await page.goto("./dang-nhap?next=%2F");
  await login(page, MANAGER.email, MANAGER.password);
  await expect(page).toHaveURL(/\/smyoutask\/$/);
  await expect(page.getByText(`Xin chào, ${MANAGER.name}`)).toBeVisible();

  await page.reload();
  await expect(page.getByText(`Xin chào, ${MANAGER.name}`)).toBeVisible(); // session restored via refresh cookie
});

test("AC-AUTH-024 KTV lần đầu phải đổi mật khẩu rồi mới vào được trang chủ", async ({
  page,
}, info) => {
  const tech = technician(info);
  await page.goto("./dang-nhap");
  await login(page, tech.email, tech.password);
  await expect(page).toHaveURL(/\/smyoutask\/doi-mat-khau$/);

  await page.goto("./");
  await expect(page).toHaveURL(/\/smyoutask\/doi-mat-khau$/);

  await page.getByLabel("Mật khẩu hiện tại").fill(tech.password);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("Moi@SmYou2026");
  await page.getByLabel("Nhập lại mật khẩu mới").fill("Moi@SmYou2026");
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã đổi mật khẩu.");
  await expect(page).toHaveURL(/\/smyoutask\/$/);
});

test("AC-AUTH-026 đăng xuất → trang đăng nhập; quay lại không mở được trang chủ", async ({
  page,
}) => {
  await page.goto("./dang-nhap");
  await login(page, MANAGER.email, MANAGER.password);
  await expect(page.getByText(`Xin chào, ${MANAGER.name}`)).toBeVisible();

  await openMenuOnPhone(page);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/smyoutask\/dang-nhap/);
  await page.goBack();
  await expect(page).toHaveURL(/\/smyoutask\/dang-nhap/);
  await expect(page.getByText(MANAGER.name)).toHaveCount(0);
});

test("AC-AUTH-027 @a11y @screenshot đăng nhập và đổi mật khẩu: axe, 360px, ảnh chụp", async ({
  page,
}, info) => {
  for (const [path, file] of [
    ["./dang-nhap", "login.png"],
    ["./doi-mat-khau", "change-password.png"],
  ] as const) {
    if (file === "change-password.png") {
      await page.goto("./dang-nhap");
      await login(page, MANAGER.email, MANAGER.password);
      await expect(page.getByText(`Xin chào, ${MANAGER.name}`)).toBeVisible();
    }
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot(info, file), fullPage: true });

    await page.setViewportSize({ width: 360, height: 780 });
    await noHorizontalScroll(page);
    await page.setViewportSize(info.project.use.viewport ?? { width: 390, height: 844 });
  }
});
