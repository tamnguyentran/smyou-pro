import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/settings/company") {
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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("AC-SYS-133 AC-SYS-134 @a11y @screenshot Thông tin công ty: form điền sẵn, sửa địa chỉ → Lưu", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Thông tin công ty" })).toBeVisible();
  const form = page.getByRole("form", { name: "Thông tin công ty" });
  await expect(form.getByLabel(/Mã số thuế/)).toHaveValue("0309390732");
  const save = form.getByRole("button", { name: "Lưu" });
  const upload = page.getByRole("button", { name: "Tải logo" });
  for (const button of [save, upload]) {
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const columns = await form
    .getByLabel(/Mã số thuế/)
    .evaluate((el) => getComputedStyle(el.closest("div.grid") ?? el).gridTemplateColumns);
  expect(columns.split(" ").length).toBe(info.project.name === "desktop" ? 2 : 1);
  await evidence(page, info, "company-profile.png");

  // Unique per run: an unchanged address keeps "Lưu" disabled (e2e DB persists between runs).
  const address = form.getByLabel(/Địa chỉ/);
  await address.fill(
    `8C/A-9C/A Nguyễn Ảnh Thủ, KP1, P. Trung Mỹ Tây, TP.HCM (${String(Date.now())})`,
  );
  await save.click();
  await expect(page.getByText("Đã lưu thông tin công ty")).toBeVisible();
});
