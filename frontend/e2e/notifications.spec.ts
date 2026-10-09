import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts/catalog created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const SALE = "hoa.e2e@smyou.vn";
const TECH_LEAD = "tuan.lead@smyou.vn";

async function signIn(page: Page, email: string, path = "/") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

/** Gửi 1 đơn mới (Sale) để chắc có ít nhất 1 thông báo `ORDER_SUBMITTED` cho TECH_LEAD (M7-01a). */
async function submitOneOrder(page: Page) {
  await signIn(page, SALE, "/orders/new");
  await page.getByLabel("Tìm khách hàng").fill("Sáng Tạo Mới");
  await page.getByRole("option", { name: /Cty Sáng Tạo Mới E2E/ }).click();
  await page.getByLabel("Địa chỉ thi công").fill("12 Lê Lợi, Q1, TP.HCM");
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const sheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await sheet.getByLabel("Tìm sản phẩm").fill("dell");
  await sheet.getByRole("button", { name: /Màn hình Dell 22 inch E2E/ }).click();
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  await page.getByRole("button", { name: "Gửi đơn" }).click();
  await page
    .getByRole("dialog", { name: "Gửi đơn?" })
    .getByRole("button", { name: "Gửi đơn" })
    .click();
  await expect(page.getByRole("button", { name: "Thu hồi" })).toBeVisible();
}

test("AC-NTF-034 AC-NTF-035 @a11y @screenshot trang /thong-bao ở 390px và 1440px", async ({
  page,
}, info) => {
  await submitOneOrder(page);
  await signIn(page, TECH_LEAD, "/thong-bao");
  await expect(page.getByRole("heading", { level: 1, name: "Thông báo" })).toBeVisible();
  await expect(page.getByText("Đơn hàng mới chờ điều phối").first()).toBeVisible();

  for (const link of await page.getByRole("link").all()) {
    const box = await link.boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, "notifications.png"), fullPage: true });

  const size = page.viewportSize();
  for (const width of [size?.width ?? 390, 360]) {
    await page.setViewportSize({ width, height: size?.height ?? 780 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});
