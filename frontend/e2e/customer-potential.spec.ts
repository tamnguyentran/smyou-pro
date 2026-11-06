import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// M21-05b: KTV ghi "Tiềm năng sử dụng dịch vụ" từ "Việc của tôi" (AC-CUS-060). Orders created by
// backend/scripts/seed_e2e.py (POTENTIAL_ORDERS) — one order + one customer per Playwright project so the
// mobile and desktop runs never read each other's latest note.
const PASSWORD = "E2e@SmYou2026";
const TECHNICIAN = "binh.ktv@smyou.vn";

const isMobile = (info: TestInfo) => info.project.name === "mobile";

function orderCode(info: TestInfo) {
  return isMobile(info) ? "E2E-DH-M2105A" : "E2E-DH-M2105B";
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

test("AC-CUS-060 @a11y @screenshot KTV ghi tiềm năng khách hàng từ Việc của tôi", async ({
  page,
}, info) => {
  const code = orderCode(info);
  // Retries (playwright.config `retries: 1`) and `make screenshots` run without reseeding, so the note a
  // previous run saved is still there — make each run's text unique instead of expecting an empty block.
  const text = `Muốn lắp thêm 4 camera kho (${info.project.name} ${Date.now().toString(36)})`;

  await signIn(page, TECHNICIAN, "/my-tasks");
  const tabs = page.getByRole("tablist", { name: "Việc của tôi" });
  await tabs.getByRole("tab", { name: /Đang làm/ }).click();
  await page
    .getByRole(isMobile(info) ? "listitem" : "row")
    .filter({ hasText: `${code}-T1` })
    .getByRole("button", { name: "Chi tiết" })
    .click();
  await expect(page.getByRole("main").getByText(code, { exact: true })).toBeVisible();

  const block = page.getByRole("region", { name: "Tiềm năng sử dụng dịch vụ" });
  await expect(block.getByRole("button", { name: "Ghi tiềm năng" })).toBeVisible();
  await expect(block.getByText(text)).toHaveCount(0);
  await block.getByRole("button", { name: "Ghi tiềm năng" }).click();
  const dialog = page.getByRole("dialog", { name: /^Tiềm năng sử dụng dịch vụ — / });
  await dialog.getByRole("textbox").fill(text);
  await dialog.getByRole("button", { name: "Lưu" }).click();

  await expect(page.getByText("Đã ghi tiềm năng khách hàng")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(block.getByText(text)).toBeVisible();
  await expect(block.getByText(/Nguyễn Văn Bình · vừa xong/i)).toBeVisible();

  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  if (isMobile(info)) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  // Viewport shot centred on the block: a fullPage capture lets the sticky header/bottom nav cover it,
  // and the success toast (auto-hides after 4s) would sit over the saved note.
  await expect(page.getByText("Đã ghi tiềm năng khách hàng")).toBeHidden({ timeout: 8000 });
  await block.evaluate((el) => {
    el.scrollIntoView({ block: "center" });
  });
  await page.screenshot({
    path: shot(info, isMobile(info) ? "customer-potential-390.png" : "customer-potential-1440.png"),
  });
});
