import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts/data created by backend/scripts/seed_e2e.py (reset before every `make e2e`):
// E2E-DH-M1504A COMPLETED, nhóm "Thiết bị an ninh", 1 dòng "Lắp đặt hệ thống camera E2E" 12.000.000;
// E2E-DH-M2401A COMPLETED, nhóm "Thiết bị văn phòng", 1 dòng "Máy in văn phòng E2E" ×2 = 3.000.000.
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const TITLE = "Doanh thu theo nhóm & sản phẩm/dịch vụ";

async function signIn(page: Page, path = "/") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Tên đăng nhập").fill(loginName(MANAGER));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function expectNoSeriousA11y(page: Page, include?: string) {
  const builder = new AxeBuilder({ page });
  const results = await (include ? builder.include(include) : builder).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
}

test("AC-RPT-160 AC-RPT-159 @a11y @screenshot Manager: menu → trang theo nhóm → đổi sang từng SP/DV → mở chi tiết", async ({
  page,
}, info) => {
  await signIn(page);
  const mobile = info.project.name === "mobile";
  if (mobile) await page.getByRole("button", { name: "Mở menu" }).click();
  const nav = page.getByRole("navigation", { name: "Menu chính" });
  await nav.getByRole("button", { name: "Báo cáo" }).click();
  const menuLink = nav.getByRole("link", { name: "Doanh thu theo SP/DV" });
  await menuLink.click();
  if (!mobile) {
    // axe must not sample the menu row mid colour transition (hover → active bg-brand #c2410c).
    await expect(menuLink).toHaveCSS("background-color", "rgb(194, 65, 12)");
  }

  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Nhóm SP/DV" })).toBeChecked();
  const security = page.getByRole("button", { name: /Thiết bị an ninh/ });
  const office = page.getByRole("button", { name: /Thiết bị văn phòng/ });
  await expect(security).toBeVisible();
  await expect(office).toBeVisible();
  // Desktop: số liệu nằm trong hàng bảng; mobile: trong thẻ (nút) — cả 2 đều chứa đủ số.
  const securityRow = mobile ? security : page.getByRole("row", { name: /Thiết bị an ninh/ });
  const officeRow = mobile ? office : page.getByRole("row", { name: /Thiết bị văn phòng/ });
  await expect(securityRow).toContainText("12.000.000");
  await expect(officeRow).toContainText("3.000.000");

  // AC-RPT-159: không cuộn ngang trang.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.evaluate(() => document.fonts.ready);
  await expectNoSeriousA11y(page);
  await page.screenshot({ path: shot(info, "revenue-by-product-group.png"), fullPage: true });

  await page.getByText("Từng sản phẩm/dịch vụ").click();
  await expect(page).toHaveURL(/mode=item/);
  const printer = page.getByRole("button", { name: /Máy in văn phòng E2E/ });
  await expect(printer).toBeVisible();
  const printerRow = mobile ? printer : page.getByRole("row", { name: /Máy in văn phòng E2E/ });
  await expect(printerRow).toContainText("Tự nhập");
  await expect(printerRow).toContainText("3.000.000");
  await expectNoSeriousA11y(page);
  await page.screenshot({ path: shot(info, "revenue-by-product-item.png"), fullPage: true });

  await printer.click();
  const dialog = page.getByRole("dialog", { name: "Máy in văn phòng E2E" });
  await expect(dialog.getByText("E2E-DH-M2401A")).toBeVisible();
  await expectNoSeriousA11y(page, '[role="dialog"]');
  await page.screenshot({ path: shot(info, "revenue-by-product-drilldown.png"), fullPage: true });
});

test("AC-RPT-157 Xuất Excel ở chế độ sản phẩm → CSV đúng mode=item, có dòng Máy in văn phòng E2E", async ({
  page,
}) => {
  await signIn(page, "/reports/revenue-by-product?mode=item");
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByRole("button", { name: /Máy in văn phòng E2E/ })).toBeVisible();

  const href = await page.getByRole("link", { name: "Xuất Excel" }).getAttribute("href");
  if (href === null) throw new Error("export link missing href");
  expect(href).toContain("mode=item");
  const response = await page.request.get(href);
  expect(response.headers()["content-disposition"] ?? "").toMatch(
    /filename="?doanh-thu-theo-san-pham-.*\.csv"?/,
  );
  expect(await response.text()).toContain("Máy in văn phòng E2E");
});
