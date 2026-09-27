import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/audit") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, file), fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("AC-SYS-072 AC-SYS-073 @a11y @screenshot Nhật ký hệ thống: bảng (máy tính) hoặc thẻ (điện thoại)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Nhật ký hệ thống" })).toBeVisible();
  // Signing in itself just audited a "login" row (AC-SYS-062) — always at least one row to show.
  const log =
    info.project.name === "desktop"
      ? page.getByRole("table", { name: "Nhật ký hệ thống" })
      : page.getByRole("list", { name: "Nhật ký hệ thống" });
  await expect(log.getByText("Đăng nhập", { exact: true }).first()).toBeVisible();
  await evidence(page, info, "audit-log.png");
});

test("AC-SYS-076 Sale mở /audit trực tiếp → 403", async ({ page }) => {
  await signIn(page, SALE);
  await expect(page.getByText("Bạn không có quyền truy cập trang này.")).toBeVisible();
});
