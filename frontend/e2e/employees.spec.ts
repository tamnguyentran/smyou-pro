import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const TECH_LEAD = "tuan.lead@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/employees") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, file), fullPage: true });
}

test("AC-EMP-013 AC-EMP-018 @a11y @screenshot danh sách Nhân sự (Manager)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Nhân sự & phân quyền" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm nhân viên" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await evidence(page, info, "employees.png");
});

test("AC-EMP-014 AC-EMP-018 @a11y @screenshot thêm nhân viên và mật khẩu tạm", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const form = page.getByRole("dialog", { name: "Thêm nhân viên" });
  await expect(form).toBeVisible();

  const email = `qa.${info.project.name}.${String(Date.now())}@smyou.vn`;
  await form.getByLabel("Họ và tên").fill("QA Kiểm thử");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Bộ phận").selectOption("SALES");
  await form.getByRole("checkbox", { name: "Nhân viên kinh doanh" }).check();
  await evidence(page, info, "employee-form.png");

  await form.getByRole("button", { name: "Lưu" }).click();
  const passwordDialog = page.getByRole("dialog", { name: "Mật khẩu tạm" });
  await expect(passwordDialog).toBeVisible();
  await expect(
    passwordDialog.getByText("Mật khẩu chỉ hiện một lần. Hãy gửi cho nhân viên qua kênh riêng."),
  ).toBeVisible();
  await evidence(page, info, "temporary-password.png");

  await passwordDialog.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByText("Đã thêm nhân viên QA Kiểm thử.")).toBeVisible();
});

test("AC-EMP-017 QLKT chỉ đọc: không có nút quản lý", async ({ page }) => {
  await signIn(page, TECH_LEAD);
  await expect(page.getByRole("heading", { level: 1, name: "Nhân sự & phân quyền" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm nhân viên" })).toHaveCount(0);
});

test("AC-EMP-017 Sale mở /employees trực tiếp → 403", async ({ page }) => {
  await signIn(page, SALE);
  await expect(page.getByText("Bạn không có quyền truy cập trang này.")).toBeVisible();
});

test("AC-EMP-018 vùng chạm ≥ 44px trên danh sách", async ({ page }) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("button", { name: "Thêm nhân viên" })).toBeVisible();
  for (const control of await page.locator("button:visible, a:visible").all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
