import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts/data created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
// E2E-DH-M1504A: COMPLETED, customer E2E-KH-001, completed_at=now, created_by=MANAGER AN.
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/reports/revenue-by-customer") {
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

test("AC-RPT-015 @a11y @screenshot Manager xem báo cáo doanh thu theo khách hàng: bảng (desktop) / thẻ (mobile)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(
    page.getByRole("heading", { level: 1, name: "Báo cáo doanh thu theo khách hàng" }),
  ).toBeVisible();
  await expect(page.getByText("E2E-KH-001")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, "revenue-by-customer-report.png"), fullPage: true });
});

test("AC-RPT-014 Manager bấm 'Xuất Excel' → tải đúng tham số lọc hiện tại, không rời trang", async ({
  page,
}) => {
  await signIn(page, MANAGER);
  await expect(
    page.getByRole("heading", { level: 1, name: "Báo cáo doanh thu theo khách hàng" }),
  ).toBeVisible();
  await expect(page.getByText("E2E-KH-001")).toBeVisible();

  const from = (await page.getByLabel("Từ ngày").inputValue()).split("/").reverse().join("-");
  const to = (await page.getByLabel("Đến ngày").inputValue()).split("/").reverse().join("-");

  const exportLink = page.getByRole("link", { name: "Xuất Excel" });
  const href = await exportLink.getAttribute("href");
  if (href === null) throw new Error("export link missing href");
  expect(href).toContain(`from=${from}`);
  expect(href).toContain(`to=${to}`);
  expect(href).toContain("status=COMPLETED");
  expect(href).not.toContain("customer_id=");

  await exportLink.click();
  // target="_blank" nên bấm không điều hướng rời trang báo cáo.
  await expect(
    page.getByRole("heading", { level: 1, name: "Báo cáo doanh thu theo khách hàng" }),
  ).toBeVisible();

  const response = await page.request.get(href);
  expect(response.headers()["content-disposition"] ?? "").toMatch(
    /filename="?doanh-thu-theo-khach-hang-.*\.csv"?/,
  );
  const content = await response.text();
  expect(content).toContain("Cty Sáng Tạo Mới E2E");
});

// M21-05b: seed_e2e.py ghi sẵn 1 tiềm năng cho E2E-KH-001 (đơn E2E-DH-M1504A, tạo hôm nay).
test("AC-CUS-059 @a11y @screenshot báo cáo hiện Tiềm năng + Ngày mua hàng cuối (thẻ ở 390px, cột ở 1440px)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByText("E2E-KH-001")).toBeVisible();
  const purchase = /\d{2}\/\d{2}\/\d{4}/;
  if (info.project.name === "mobile") {
    const card = page.getByRole("listitem").filter({ hasText: "E2E-KH-001" }).first();
    await expect(card.getByText("Tiềm năng: Muốn lắp thêm 4 camera kho E2E")).toBeVisible();
    await expect(card.getByText(/^Mua cuối: \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 780 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 780 });
  } else {
    await expect(page.getByRole("columnheader", { name: "Tiềm năng" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Ngày mua hàng cuối" })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "E2E-KH-001" }).first();
    await expect(row.getByText("Muốn lắp thêm 4 camera kho E2E")).toBeVisible();
    await expect(row.getByText(purchase)).toBeVisible();
  }
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, "revenue-by-customer-potential.png"), fullPage: true });
});

test("AC-UI-100 Từ ngày/Đến ngày gõ kiểu dd/MM/yyyy → API và link xuất dùng yyyy-MM-dd", async ({
  page,
}) => {
  await signIn(page, MANAGER, "/reports/revenue-by-customer");
  const from = page.getByLabel("Từ ngày");
  const to = page.getByLabel("Đến ngày");
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await from.fill("");
  await from.pressSequentially("01102026");
  await to.fill("");
  const loaded = page.waitForRequest(
    (r) =>
      r.url().includes("/api/v1/reports/revenue-by-customer?") && r.url().includes("to=2026-10-31"),
  );
  await to.pressSequentially("31102026");
  expect((await loaded).url()).toContain("from=2026-10-01");
  await expect(from).toHaveValue("01/10/2026");
  await expect(to).toHaveValue("31/10/2026");
  const href = await page.getByRole("link", { name: /Xuất Excel/ }).getAttribute("href");
  expect(href).toContain("from=2026-10-01");
  expect(href).toContain("to=2026-10-31");
});
