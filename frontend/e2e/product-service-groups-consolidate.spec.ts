import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// M20-06: DB e2e đã qua migration gộp nhóm; seed_e2e.py thêm 2 nhóm đã ngừng "Thiết bị mạng",
// "Máy in cũ" (trạng thái sau migration của dữ liệu chung trong spec).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";
const STANDARD = ["Kỹ thuật chung", "Thiết bị an ninh", "Thiết bị văn phòng"];
const RETIRED = ["Thiết bị mạng", "Máy in cũ"];

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

test("AC-CAT-106 order form offers only the 3 standard groups", async ({ page }, info) => {
  await signIn(page, SALE, "/orders/new");

  const select = page.getByLabel("Nhóm sản phẩm/dịch vụ");
  await expect(select.locator("option", { hasText: "Kỹ thuật chung" })).toBeAttached();
  const options = (await select.locator("option").allTextContents()).filter(
    (label) => !label.startsWith("—"),
  );
  expect(options.sort()).toEqual([...STANDARD].sort());
  await page.screenshot({ path: shot(info, "m20-06-order-form-groups.png"), fullPage: true });
});

test("AC-CAT-107 groups page lists 3 active standard groups, retired ones under the inactive filter", async ({
  page,
}, info) => {
  await signIn(page, MANAGER, "/catalog/groups");
  const main = page.getByRole("main");
  // Desktop: button = tên nhóm; mobile: thẻ = tên nhóm + badge trạng thái.
  const names = (list: string[]) => new RegExp(`^(${list.join("|")})( |$)`);

  await page.getByLabel("Trạng thái").selectOption({ label: "Đang hoạt động" });
  await expect(main.getByRole("button", { name: names(STANDARD) })).toHaveCount(3);
  await expect(main.getByRole("button", { name: names(RETIRED) })).toHaveCount(0);
  await page.screenshot({ path: shot(info, "m20-06-groups-active.png"), fullPage: true });

  await page.getByLabel("Trạng thái").selectOption({ label: "Đã ngừng hoạt động" });
  await expect(main.getByRole("button", { name: names(RETIRED) })).toHaveCount(2);
  await expect(main.getByRole("button", { name: names(STANDARD) })).toHaveCount(0);
  await page.screenshot({ path: shot(info, "m20-06-groups-inactive.png"), fullPage: true });
});
