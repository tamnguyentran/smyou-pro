import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// M20-07: DB e2e đã qua migration gộp phòng ban — chỉ còn 3 phòng chuẩn, phòng cũ bị xoá hẳn.
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const STANDARD = ["Kế Toán - Tài chính", "Nhân sự/Marketing", "Phát Triển Kinh Tế"];
const LEGACY = ["Ban quản lý", "Kinh doanh", "Kỹ thuật"];

async function signIn(page: Page, email: string, path: string) {
  await page.goto("./dang-nhap");
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // UAT-05: sign-in always lands on Tổng quan; then open the page under test.
  await page.waitForURL(/\/smyoutask\/$/);
  await page.goto(`.${path}`);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

test("AC-EMP-102 employee form offers only the 3 standard departments", async ({ page }, info) => {
  await signIn(page, MANAGER, "/employees");
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const form = page.getByRole("dialog", { name: "Thêm nhân viên" });
  const select = form.getByLabel("Phòng ban");
  await expect(select.locator("option", { hasText: "Phát Triển Kinh Tế" })).toBeAttached();

  // The "Chọn phòng ban" placeholder has an empty value.
  const options = await select.locator('option:not([value=""])').allTextContents();
  expect(options.sort()).toEqual([...STANDARD].sort());
  await page.screenshot({
    path: shot(info, "m20-07-employee-form-departments.png"),
    fullPage: true,
  });
});

test("AC-EMP-104 departments page: 3 standard under 'Tất cả', nothing under 'Ngừng hoạt động'", async ({
  page,
}, info) => {
  await signIn(page, MANAGER, "/settings/departments");
  const main = page.getByRole("main");

  await page.getByLabel("Trạng thái").selectOption({ label: "Tất cả" });
  for (const name of STANDARD) {
    await expect(main.getByText(name, { exact: true }).first()).toBeVisible();
  }
  for (const name of LEGACY) {
    await expect(main.getByText(name, { exact: true })).toHaveCount(0);
  }
  await page.screenshot({ path: shot(info, "m20-07-departments-all.png"), fullPage: true });

  await page.getByLabel("Trạng thái").selectOption({ label: "Ngừng hoạt động" });
  await expect(main.getByText("Chưa có phòng ban nào.")).toBeVisible();
  for (const name of [...STANDARD, ...LEGACY]) {
    await expect(main.getByText(name, { exact: true })).toHaveCount(0);
  }
  await page.screenshot({ path: shot(info, "m20-07-departments-inactive.png"), fullPage: true });
});
