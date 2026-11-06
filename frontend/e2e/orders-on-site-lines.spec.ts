import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// M19-01b: KTV thêm dòng hàng tại hiện trường (AC-ORD-242). Accounts/orders created by
// backend/scripts/seed_e2e.py (ON_SITE_ORDERS) — one order per Playwright project, same reason as
// orders-complete.spec.ts (a concurrent mobile+desktop run against one order races `orders.version`).
const PASSWORD = "E2e@SmYou2026";
const TECHNICIAN = "binh.ktv@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";
const SSD = "Ổ cứng SSD Kingston 512GB E2E";

const isMobile = (info: TestInfo) => info.project.name === "mobile";

function orderCode(info: TestInfo) {
  return isMobile(info) ? "E2E-DH-M1901A" : "E2E-DH-M1901B";
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function signIn(page: Page, email: string, path: string) {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
}

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, file), fullPage: true });
  if (!isMobile(info)) return;
  const size = page.viewportSize();
  for (const width of [size?.width ?? 390, 360]) {
    await page.setViewportSize({ width, height: size?.height ?? 780 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  if (size) await page.setViewportSize(size);
}

test("AC-ORD-242 @a11y @screenshot KTV thêm dòng hàng tại hiện trường, Sale nhận thông báo", async ({
  page,
}, info) => {
  const code = orderCode(info);

  await signIn(page, TECHNICIAN, "/my-tasks");
  const tabs = page.getByRole("tablist", { name: "Việc của tôi" });
  await tabs.getByRole("tab", { name: /Đang làm/ }).click();
  // "Việc của tôi": thẻ (listitem) ở mobile, bảng (row) ở desktop.
  await page
    .getByRole(isMobile(info) ? "listitem" : "row")
    .filter({ hasText: `${code}-T1` })
    .getByRole("button", { name: "Chi tiết" })
    .click();
  await expect(page.getByRole("main").getByText(code, { exact: true })).toBeVisible();
  const orderUrl = page.url();

  await page.getByRole("tab", { name: "Dòng hàng" }).click();
  await expect(page.getByText("1.000.000 ₫").last()).toBeVisible();
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const sheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await sheet.getByLabel("Tìm sản phẩm").fill("Kingston");
  await sheet.getByRole("button", { name: new RegExp(SSD) }).click();
  await expect(page.getByText(/Đã thêm dòng hàng/)).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: SSD });
  await expect(row.getByText("KTV thêm · Nguyễn Văn Bình")).toBeVisible();
  await expect(row.getByText("Ghi doanh số: Nguyễn Văn Bình")).toBeVisible();
  const qty = row.getByLabel("Số lượng");
  await qty.fill("2");
  await qty.blur();
  await expect(row.getByText("2.700.000 ₫")).toBeVisible();
  // Tổng đơn: 1.000.000 (dòng Hoa) + 2 × 1.350.000 (SSD, VAT 0) = 3.700.000.
  await expect(page.getByText("3.700.000 ₫").last()).toBeVisible();

  await evidence(
    page,
    info,
    isMobile(info) ? "order-on-site-lines-390.png" : "order-on-site-lines-1440.png",
  );

  // Sale chủ đơn nhận thông báo "KTV thay đổi dòng hàng" cho lần thêm này; bấm vào mở đúng đơn.
  await page.context().clearCookies();
  await signIn(page, SALE, "/thong-bao");
  const addedNotice = page
    .getByRole("link")
    .filter({ hasText: "KTV thay đổi dòng hàng" })
    .filter({ hasText: `Đơn ${code}: Nguyễn Văn Bình thêm` });
  await expect(addedNotice).toHaveCount(1);
  await addedNotice.click();
  await expect(page).toHaveURL(orderUrl);
  await page.getByRole("tab", { name: "Dòng hàng" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: SSD }).getByText("KTV thêm · Nguyễn Văn Bình"),
  ).toBeVisible();
});
