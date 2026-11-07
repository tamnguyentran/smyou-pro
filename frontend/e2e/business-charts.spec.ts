import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";

async function signIn(page: Page, email: string, path: string) {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b ?? { x: 0, y: 0, width: 0, height: 0 };
}

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: shot(info, file), fullPage: true });
}

const TABS = [
  { name: "Kết quả kinh doanh", file: "business-charts-results.png" },
  { name: "Bán hàng & sản phẩm", file: "business-charts-sales.png" },
  { name: "Nhân sự & KPI", file: "business-charts-staff.png" },
];

/** 390px: a card's two month inputs share one row (M25-01), tabs scroll sideways at ≥44px,
 * charts full width × 280px, legend below. */
async function checkMobile(page: Page) {
  const monthly = page.getByRole("region", { name: "Doanh thu & Lợi nhuận theo tháng" });
  const from = await box(monthly.getByLabel("Từ tháng"));
  const to = await box(monthly.getByLabel("Đến tháng"));
  expect(Math.abs(to.y - from.y)).toBeLessThan(2);
  expect(to.x).toBeGreaterThan(from.x + from.width - 1);

  const tablist = page.getByRole("tablist", { name: "Nhóm biểu đồ" });
  expect(await tablist.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
  for (const tab of await tablist.getByRole("tab").all()) {
    expect((await box(tab)).height).toBeGreaterThanOrEqual(44);
  }

  const customers = page.getByRole("region", { name: "Khách hàng mới & quay lại" });
  const chart = await box(customers.getByRole("img"));
  const legend = await box(customers.getByRole("list", { name: "Chú giải" }));
  expect(legend.y).toBeGreaterThanOrEqual(chart.y + chart.height - 1);
}

/** 1440px: combo chart full width; "Cơ cấu" + "Khách hàng mới & quay lại" side by side; 320px. */
async function checkDesktop(page: Page) {
  const panel = await box(page.getByRole("tabpanel"));
  const monthly = page.getByRole("region", { name: "Doanh thu & Lợi nhuận theo tháng" });
  expect((await box(monthly)).width).toBeGreaterThan(panel.width - 2);
  const composition = await box(page.getByRole("region", { name: /^Cơ cấu/ }));
  const customers = await box(page.getByRole("region", { name: "Khách hàng mới & quay lại" }));
  expect(Math.abs(composition.y - customers.y)).toBeLessThan(2);
  expect(customers.x).toBeGreaterThan(composition.x + composition.width - 1);
}

/** AC-RPT-170 (B7-04): on desktop every card's period picker sits on the title's row, right side. */
async function checkPickersBesideTitles(page: Page) {
  for (const region of await page.getByRole("tabpanel").getByRole("region").all()) {
    const title = await box(region.getByRole("heading", { level: 2 }));
    const picker = await box(region.getByRole("textbox", { name: /tháng/i }).first());
    expect(picker.x).toBeGreaterThan(title.x + 40);
    expect(picker.y).toBeLessThan(title.y + title.height + 32);
  }
}

test("AC-RPT-123 AC-RPT-135 AC-RPT-136 AC-RPT-137 AC-RPT-170 @a11y @screenshot Biểu đồ kinh doanh: bố cục 390px/1440px, mỗi tab không cuộn ngang, axe sạch", async ({
  page,
}, info) => {
  const desktop = info.project.name === "desktop";
  await signIn(page, MANAGER, "/reports/business-charts");
  await expect(page.getByRole("heading", { level: 1, name: "Biểu đồ kinh doanh" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Kết quả kinh doanh" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Từ tháng").first()).toHaveValue(/^\d{2}\/\d{4}$/);
  await expect(page.getByRole("tabpanel").getByRole("img").first()).toBeVisible();
  await (desktop ? checkDesktop(page) : checkMobile(page));

  for (const { name, file } of TABS) {
    const tab = page.getByRole("tab", { name });
    await tab.click();
    // The tab colours animate (200ms); axe must see the settled colours, not a mid-fade frame.
    await expect(tab).toHaveCSS("background-color", "rgb(194, 65, 12)");
    await expect(page.getByRole("tab", { selected: false }).first()).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("region").first()).toBeVisible();
    await expect(panel.getByLabel("Đang tải biểu đồ")).toHaveCount(0);
    const width = (await box(panel)).width;
    if (desktop) await checkPickersBesideTitles(page);
    // AC-RPT-170: every month picker lives inside a card and is a ≥44px touch target.
    const pickers = panel.getByRole("textbox", { name: /tháng/i });
    expect(await pickers.count()).toBeGreaterThan(0);
    expect(await page.getByRole("textbox", { name: /tháng/i }).count()).toBe(await pickers.count());
    for (const picker of await pickers.all()) {
      expect((await box(picker)).height).toBeGreaterThanOrEqual(44);
    }
    for (const chart of await panel.getByRole("img").all()) {
      const b = await box(chart);
      expect(Math.round(b.height)).toBe(desktop ? 320 : 280);
      if (!desktop) expect(b.width).toBeGreaterThan(width - 48);
    }
    await evidence(page, info, file);
  }
});
