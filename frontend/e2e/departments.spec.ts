import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/settings/departments") {
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

test("AC-EMP-047 AC-EMP-048 @a11y @screenshot Phòng ban: bảng (desktop) / thẻ (mobile)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Phòng ban" })).toBeVisible();
  await expect(page.getByLabel("Tìm kiếm")).toBeVisible();
  await expect(page.getByLabel("Trạng thái")).toBeVisible();
  const add = page.getByRole("button", { name: "Thêm phòng ban" });
  expect((await add.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  if (info.project.name === "desktop") {
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveText([
      "Tên phòng ban",
      "Trạng thái",
      "Thao tác",
    ]);
    await expect(table.getByRole("row", { name: /Kế Toán - tài chính/ })).toBeVisible();
  } else {
    await expect(page.getByRole("table")).toHaveCount(0);
    const card = page.getByRole("listitem").filter({ hasText: "Kế Toán - tài chính" });
    await expect(card).toBeVisible();
    await expect(card.getByText(/hoạt động/)).toBeVisible();
  }
  await evidence(page, info, "departments.png");
});
