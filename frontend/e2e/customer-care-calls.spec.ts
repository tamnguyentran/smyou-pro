import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// M27-01b: CSKH ghi nhận cuộc gọi trên "Đơn hàng › Chăm sóc KH" cho khách seed E2E-KH-001
// (backend/scripts/seed_e2e.py CUSTOMERS). Cuộc gọi không xoá được, nên mỗi lần chạy dùng nội dung
// riêng và tìm đúng dòng đó thay vì kỳ vọng danh sách trống.
const PASSWORD = "E2e@SmYou2026";
const CUSTOMER_CARE = "lan.cskh@smyou.vn";
const CUSTOMER = "Cty Sáng Tạo Mới E2E";

const isMobile = (info: TestInfo) => info.project.name === "mobile";

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function signIn(page: Page, email: string, path: string) {
  await page.goto("./dang-nhap");
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // UAT-05: sign-in always lands on Tổng quan; then open the page under test.
  await page.waitForURL(/\/smyoutask\/$/);
  await page.goto(`.${path}`);
  await expect(page).not.toHaveURL(/dang-nhap/);
}

async function expectAccessible(page: Page, info: TestInfo) {
  await page.mouse.move(0, 0);
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
  if (isMobile(info)) {
    for (const button of await page
      .getByRole("button", { name: /Ghi nhận cuộc gọi|Lưu|Huỷ/ })
      .all()) {
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
}

test("AC-CUS-075 AC-CUS-079 @a11y @screenshot CSKH ghi nhận cuộc gọi và thấy trong danh sách", async ({
  page,
}, info) => {
  const offered = `Camera IP 4MP (${info.project.name} ${Date.now().toString(36)})`;

  await signIn(page, CUSTOMER_CARE, "/customer-care");
  await expect(page.getByRole("heading", { name: "Chăm sóc khách hàng" })).toBeVisible();

  await page.getByRole("button", { name: "Ghi nhận cuộc gọi" }).click();
  const dialog = page.getByRole("dialog", { name: "Ghi nhận cuộc gọi" });
  await dialog.getByLabel("Khách hàng").fill("Sáng Tạo Mới");
  await dialog.getByRole("option", { name: new RegExp(CUSTOMER) }).click();
  await dialog.getByLabel("Chào sản phẩm/dịch vụ").fill(offered);
  await expectAccessible(page, info);
  await page.screenshot({
    path: shot(
      info,
      isMobile(info) ? "customer-care-sheet-390.png" : "customer-care-sheet-1440.png",
    ),
  });

  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã ghi nhận cuộc gọi.")).toBeVisible();
  await expect(dialog).toBeHidden();

  const entry = page.getByRole(isMobile(info) ? "listitem" : "row").filter({ hasText: offered });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText(CUSTOMER);
  await expect(entry).toContainText("—");
  await expect(entry).toContainText("Nguyễn Thị Lan");
  if (!isMobile(info)) {
    await expect(page.getByRole("columnheader", { name: "Yêu cầu của KH" })).toBeVisible();
  }

  await expect(page.getByText("Đã ghi nhận cuộc gọi.")).toBeHidden({ timeout: 8000 });
  await expectAccessible(page, info);
  await page.screenshot({
    path: shot(info, isMobile(info) ? "customer-care-390.png" : "customer-care-1440.png"),
  });
});

test("AC-CUS-085 @a11y @screenshot checkbox 'Chỉ cuộc gọi của tôi': vùng chạm ≥ 44px, bỏ chọn hiện ô 'Người gọi'", async ({
  page,
}, info) => {
  await signIn(page, CUSTOMER_CARE, "/customer-care");
  await expect(page.getByRole("heading", { name: "Chăm sóc khách hàng" })).toBeVisible();

  const mine = page.getByRole("checkbox", { name: "Chỉ cuộc gọi của tôi" });
  await expect(mine).toBeChecked();
  const label = page.locator("label").filter({ has: mine });
  expect((await label.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByLabel("Người gọi")).toHaveCount(0);

  await label.click();
  await expect(mine).not.toBeChecked();
  await expect(page).toHaveURL(/[?&]mine=0/);
  await expect(page.getByLabel("Người gọi")).toBeVisible();
  await expectAccessible(page, info);
  await page.screenshot({
    path: shot(info, isMobile(info) ? "customer-care-all-390.png" : "customer-care-all-1440.png"),
  });
});
