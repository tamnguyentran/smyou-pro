import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts/data created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
// E2E-DH-M1504A: COMPLETED, customer E2E-KH-001, completed_at=now, created_by=MANAGER AN.
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/reports/revenue-by-customer") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
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

  const from = await page.getByLabel("Từ ngày").inputValue();
  const to = await page.getByLabel("Đến ngày").inputValue();

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
