import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// M6-03b: "Chuyển Chỉnh sửa" (AC-ORD-156/157). Accounts/orders created by backend/scripts/seed_e2e.py
// (REVISE_ORDERS) — one order per Playwright project, same reason as orders-complete.spec.ts's
// COMPLETE_ORDERS (a concurrent mobile+desktop run against one order would race `orders.version`).
const PASSWORD = "E2e@SmYou2026";
const TECH_LEAD = "tuan.lead@smyou.vn";

function orderCode(info: TestInfo) {
  return info.project.name === "mobile" ? "E2E-DH-M603A" : "E2E-DH-M603B";
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

const isMobile = (info: TestInfo) => info.project.name === "mobile";

async function evidence(page: Page, info: TestInfo, file: string) {
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

async function signInAndOpenOrder(page: Page, info: TestInfo): Promise<string> {
  const code = orderCode(info);
  await page.goto("./dang-nhap");
  await page.getByLabel("Email").fill(TECH_LEAD);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);

  const listRes = await page.request.get("api/v1/orders", { params: { q: code } });
  const { items } = (await listRes.json()) as { items: { id: string; code: string }[] };
  const order = items.find((o) => o.code === code);
  if (!order) throw new Error(`seed_e2e.py order ${code} not found for ${TECH_LEAD}`);
  await page.goto(`./orders/${order.id}`);
  return code;
}

test("AC-ORD-156 AC-ORD-157 @a11y @screenshot Chuyển Chỉnh sửa: nhập lý do, xác nhận, đơn đổi Chỉnh sửa", async ({
  page,
}, info) => {
  const code = await signInAndOpenOrder(page, info);
  await expect(page.getByRole("main").getByText(code)).toBeVisible();

  await page.getByRole("button", { name: "Chuyển Chỉnh sửa" }).click();
  const dialog = page.getByRole("dialog", { name: `Chuyển đơn ${code} sang Chỉnh sửa?` });
  await dialog.getByLabel("Lý do").fill("Camera lắp sai vị trí, khách yêu cầu chỉnh lại");
  await dialog.getByRole("button", { name: "Xác nhận" }).click();

  await expect(page.getByText(`Đã chuyển đơn ${code} sang Chỉnh sửa.`)).toBeVisible();
  await expect(page.getByText("Chỉnh sửa", { exact: true })).toBeVisible();

  await evidence(page, info, isMobile(info) ? "order-revise-390.png" : "order-revise-1440.png");
});
