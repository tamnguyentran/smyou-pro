import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts/catalog created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";
const OTHER_SALE = "ha.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/orders/new") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

const isMobile = (info: TestInfo) => info.project.name === "mobile";

async function evidence(
  page: Page,
  info: TestInfo,
  file: string,
  { checkOverflow = false }: { checkOverflow?: boolean } = {},
) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, file), fullPage: true });
  if (!checkOverflow) return;
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

test("AC-ORD-024 AC-ORD-025 AC-ORD-026 AC-ORD-030 AC-ORD-032 AC-ORD-034 AC-ORD-039 @a11y @screenshot tạo đơn nháp đầy đủ, lưu, mở lại", async ({
  page,
}, info) => {
  await signIn(page, SALE);
  await expect(page.getByRole("heading", { level: 1, name: "Tạo đơn mới" })).toBeVisible();
  // Overflow check right away, before any typing: evidence()'s checkOverflow resizes across the
  // 1024px breakpoint, which remounts AppShell's outlet (same caveat as customers.spec.ts /
  // services.spec.ts) — safe only here, before there is any unsaved input for it to wipe.
  await evidence(page, info, "order-new-empty.png", { checkOverflow: true });

  // AC-ORD-025: tìm khách có sẵn
  await page.getByLabel("Tìm khách hàng").fill("Sáng Tạo Mới");
  await page.getByRole("option", { name: /Cty Sáng Tạo Mới E2E/ }).click();
  await expect(page.getByText("0909123456")).toBeVisible();
  await page.getByLabel("Địa chỉ thi công").fill("12 Lê Lợi, Q1, TP.HCM");
  await evidence(page, info, "order-new.png");

  // AC-ORD-026: dòng sản phẩm giá cố định (tạo nháp ngầm ở lần thêm dòng đầu tiên)
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const sheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await sheet.getByLabel("Tìm sản phẩm").fill("dell");
  await sheet.getByRole("button", { name: /Màn hình Dell 22 inch E2E/ }).click();
  await expect(page.getByText("Màn hình Dell 22 inch E2E")).toBeVisible();
  expect(page.url()).toContain("/orders/");

  // AC-ORD-030: dòng tự do có giảm giá
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const sheet2 = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await sheet2.getByRole("tab", { name: "Tự do" }).click();
  await sheet2.getByLabel("Tên").fill("Công tháo dỡ tủ mạng cũ");
  await sheet2.getByLabel("Đơn vị").selectOption("LAN");
  await sheet2.getByLabel("Số lượng").fill("1");
  await sheet2.getByLabel("Đơn giá").fill("500000");
  await sheet2.getByRole("radio", { name: "10%" }).click();
  await sheet2.getByRole("button", { name: "Thêm" }).click();
  await expect(page.getByText("Công tháo dỡ tủ mạng cũ")).toBeVisible();

  const customRow = page.getByTestId(/order-line-/).filter({ hasText: "Công tháo dỡ tủ mạng cũ" });
  await customRow.getByLabel("Giảm giá").fill("50000");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  await evidence(page, info, "order-lines.png");

  const url = page.url();
  await page.reload();
  await expect(page.getByText("Màn hình Dell 22 inch E2E")).toBeVisible();
  await expect(page.getByText("Công tháo dỡ tủ mạng cũ")).toBeVisible();
  expect(page.url()).toBe(url);

  // AC-ORD-032: xoá dòng tự do
  await customRow.getByRole("button", { name: /Xoá dòng/ }).click();
  await page
    .getByRole("dialog", { name: "Xoá dòng hàng" })
    .getByRole("button", { name: "Xoá" })
    .click();
  await expect(page.getByText("Đã xoá dòng hàng.")).toBeVisible();
  await expect(page.getByText("Công tháo dỡ tủ mạng cũ")).toHaveCount(0);
});

test("AC-ORD-037 Hà (SALE khác) chỉ xem đơn của Hoa; An (MANAGER) sửa được", async ({
  page,
}, info) => {
  await signIn(page, SALE);
  await page.getByLabel("Tìm khách hàng").fill("Sáng Tạo Mới");
  await page.getByRole("option", { name: /Cty Sáng Tạo Mới E2E/ }).click();
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  // baseURL already carries the app's own base path (playwright.config.ts) — page.url()'s pathname
  // would double it up if passed straight through as `next`, so re-derive just "/orders/{id}".
  const segments = new URL(page.url()).pathname.split("/");
  const orderId = segments[segments.length - 1];
  const orderPath = `/orders/${orderId ?? ""}`;

  // Switching identity mid-test: clear the httpOnly session cookie first, or /dang-nhap's
  // SignedOutOnly guard finds Hoa's session still valid and redirects straight past the login form
  // (flaky — "Email" never appears) instead of showing it for the next sign-in.
  await page.context().clearCookies();
  await signIn(page, OTHER_SALE, orderPath);
  // AC-ORD-038: reopening a saved order starts with Section 1 collapsed on mobile — expand it before
  // checking the read-only customer field it contains.
  if (isMobile(info)) await page.getByRole("button", { name: "Thông tin đơn" }).click();
  await expect(page.getByText("Cty Sáng Tạo Mới E2E")).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm dòng hàng" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lưu nháp" })).toHaveCount(0);

  await page.context().clearCookies();
  await signIn(page, MANAGER, orderPath);
  await expect(page.getByRole("button", { name: "Thêm dòng hàng" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu nháp" })).toBeVisible();
});
