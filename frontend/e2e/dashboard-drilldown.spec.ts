import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const SALE = "hoa.e2e@smyou.vn";
const TECH_LEAD = "tuan.lead@smyou.vn";

async function signIn(page: Page, email: string, path: string) {
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
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  // Sidebar nav "active" background still has a CSS transition `document.getAnimations()`
  // doesn't always report finished for right after a client-side navigation; without this,
  // axe occasionally samples the sidebar mid-transition (flaky color-contrast on the old item).
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, file), fullPage: true });
}

test("AC-DASH-022 AC-DASH-023 AC-DASH-026 AC-DASH-031 @a11y @screenshot Hoa (SALE) bấm thẻ đơn → /orders đã lọc sẵn, checkbox 'Chỉ đơn của tôi' đã tick", async ({
  page,
}, info) => {
  await signIn(page, SALE, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const tile = page.getByText("Nháp").locator("xpath=ancestor::a[1]");
  await evidence(page, info, "dashboard-drilldown-overview.png");

  await tile.click();
  await expect(page).toHaveURL(/\/orders\?status=DRAFT&mine=1$/);
  await expect(page.getByRole("checkbox", { name: "Chỉ đơn của tôi" })).toBeChecked();
  await expect(
    page.getByRole("radiogroup", { name: "Trạng thái" }).getByRole("radio", { name: "Nháp" }),
  ).toHaveAttribute("aria-checked", "true");
  await evidence(page, info, "dashboard-drilldown-orders-filtered.png");
});

test("AC-DASH-027 AC-DASH-028 @a11y @screenshot Tuấn (TECH_LEAD) bấm 'Chờ điều phối' → /dispatch/queue; 'Cần giao lại'/'Quá hạn' không phải link", async ({
  page,
}, info) => {
  await signIn(page, TECH_LEAD, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  const needsAssignee = page.getByText("Cần giao lại");
  const overdue = page.getByText("Quá hạn");
  await expect(needsAssignee.locator("xpath=ancestor::a")).toHaveCount(0);
  await expect(overdue.locator("xpath=ancestor::a")).toHaveCount(0);

  const pendingDispatchTile = page.getByText("Chờ điều phối").locator("xpath=ancestor::a[1]");
  await pendingDispatchTile.click();
  await expect(page).toHaveURL(/\/dispatch\/queue$/);
  await evidence(page, info, "dashboard-drilldown-dispatch-queue.png");
});
