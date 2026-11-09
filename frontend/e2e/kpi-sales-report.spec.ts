import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";

async function signIn(page: Page, email: string, path: string) {
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

function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })
    .format(new Date())
    .slice(0, 7);
}

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, file) });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

/** Hoa gets a target for the current month so the report always has at least her row. */
async function ensureHoaTarget(page: Page) {
  const month = currentMonth();
  const list = await page.request.get(`api/v1/kpi-targets?month=${month}&q=hoa.e2e&limit=1`);
  expect(list.ok()).toBe(true);
  const body = (await list.json()) as {
    items: { employee_id: string; target: number | null; version: number | null }[];
  };
  const hoa = body.items[0];
  expect(hoa).toBeDefined();
  if (!hoa || hoa.target !== null) return;
  const res = await page.request.put(`api/v1/kpi-targets/${hoa.employee_id}/${month}`, {
    data: { net_revenue_target: 20_000_000 },
  });
  expect(res.ok()).toBe(true);
}

test("AC-RPT-094 @a11y @screenshot Báo cáo KPI: thẻ mỗi nhân viên (mobile) / bảng (desktop), không cuộn ngang", async ({
  page,
}, info) => {
  await signIn(page, MANAGER, "/reports/kpi-sales");
  await expect(page.getByRole("heading", { level: 1, name: "Báo cáo KPI" })).toBeVisible();
  await ensureHoaTarget(page);
  await page.reload();

  if (info.project.name === "desktop") {
    const table = page.getByRole("table");
    await expect(table.getByText("Tổng cộng")).toBeVisible();
    await expect(page.getByRole("link", { name: "Xuất Excel" })).toBeVisible();
  } else {
    const list = page.getByRole("list", { name: "Báo cáo KPI theo nhân viên" });
    await expect(list.getByRole("listitem").first()).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Xuất Excel" })).toHaveCount(0);
  }
  await evidence(page, info, "kpi-sales-report.png");
});

test("AC-RPT-096 @a11y @screenshot Sale xem 'KPI doanh số của tôi' ở Thông tin tài khoản", async ({
  page,
}, info) => {
  await signIn(page, SALE, "/ca-nhan");
  const card = page.getByRole("region", { name: "KPI doanh số của tôi" });
  await expect(card.getByText("Tổng doanh số")).toBeVisible();
  await expect(card.getByText("Tỷ lệ đạt")).toBeVisible();
  await evidence(page, info, "profile-my-kpi-sales.png");
});

test("AC-RPT-099 @screenshot Thông tin tài khoản: thẻ cá nhân + thẻ KPI cùng hàng từ 768px, xếp dọc trên điện thoại", async ({
  page,
}, info) => {
  await signIn(page, SALE, "/ca-nhan");
  const card = page.getByRole("region", { name: "KPI doanh số của tôi" });
  await expect(card.getByText("Tổng doanh số")).toBeVisible();
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  const widths = desktop ? [1440, 768] : [page.viewportSize()?.width ?? 390];

  for (const width of widths) {
    if (desktop) await page.setViewportSize({ width, height: 900 });
    const boxes = await card
      .locator("xpath=..")
      .locator(":scope > section")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
    expect(boxes).toHaveLength(2);
    const [profile, kpi] = boxes as [(typeof boxes)[number], (typeof boxes)[number]];
    const where = `AC-RPT-099 @${String(width)}px`;
    if (desktop) {
      expect(Math.round(kpi.y), where).toBe(Math.round(profile.y));
      expect(kpi.x, where).toBeGreaterThan(profile.x + profile.width - 1);
    } else {
      expect(kpi.y, where).toBeGreaterThan(profile.y + profile.height - 1);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, where).toBe(false);
  }
  if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: shot(info, "profile-kpi-row.png"), fullPage: true });
});
