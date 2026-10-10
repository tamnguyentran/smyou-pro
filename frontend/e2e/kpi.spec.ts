import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const TECHNICIAN = "khoa.shell@smyou.vn";

async function signIn(page: Page, email: string, path = "/reports/kpi") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

test("AC-KPI-017 AC-KPI-018 @a11y @screenshot Manager xem báo cáo KPI: bảng (desktop) / card (mobile)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Báo cáo KPI" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("E2E");
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, "kpi-report.png"), fullPage: true });
});

test("AC-KPI-023 @a11y @screenshot Kỹ thuật viên xem báo cáo KPI: 1 thẻ số liệu của chính mình", async ({
  page,
}, info) => {
  await signIn(page, TECHNICIAN);
  await expect(page.getByRole("heading", { level: 1, name: "Báo cáo KPI" })).toBeVisible();
  await expect(page.getByLabel("Kỹ thuật viên")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, "kpi-report-self.png"), fullPage: true });
});

test("AC-KPI-022 Manager lọc theo KTV rồi xuất CSV: tải đúng tham số, không rời trang", async ({
  page,
}) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Báo cáo KPI" })).toBeVisible();

  await page.getByLabel("Kỹ thuật viên").selectOption({ label: "Trần Minh Khoa (E2E08)" });
  await expect(page.getByRole("main")).toContainText("Trần Minh Khoa");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Xuất CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^bao-cao-kpi-.*\.csv$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = readFileSync(path, "utf-8");
  expect(content).toContain("Trần Minh Khoa");
  // Vẫn ở trang báo cáo — không điều hướng rời trang vì tải file.
  await expect(page.getByRole("heading", { level: 1, name: "Báo cáo KPI" })).toBeVisible();
});

test("AC-KPI-024 Kỹ thuật viên xuất CSV: chỉ 1 dòng của chính mình, không có ô lọc KTV", async ({
  page,
}) => {
  await signIn(page, TECHNICIAN);
  await expect(page.getByRole("heading", { level: 1, name: "Báo cáo KPI" })).toBeVisible();
  await expect(page.getByLabel("Kỹ thuật viên")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Xuất CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^bao-cao-kpi-.*\.csv$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = readFileSync(path, "utf-8");
  const dataLines = content.split("\n").filter((line) => line.trim() !== "");
  expect(dataLines).toHaveLength(2); // header + 1 dòng (chính mình)
});
