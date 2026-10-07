import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts/data created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const TECHNICIAN = "khoa.shell@smyou.vn";

async function signIn(page: Page, path: string) {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(TECHNICIAN);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

const isMobile = (info: TestInfo) => info.project.name === "mobile";

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
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

test("AC-ASG-015 AC-ASG-016 @a11y @screenshot Việc của tôi: 3 tab, gọi/bản đồ, không cuộn ngang, axe sạch", async ({
  page,
}, info) => {
  await signIn(page, "/my-tasks");
  await expect(page.getByRole("heading", { name: "Việc của tôi", level: 1 })).toBeVisible();

  const tabs = page.getByRole("tablist", { name: "Việc của tôi" });
  await expect(tabs.getByRole("tab", { name: /Chờ nhận/ })).toBeVisible();
  await expect(page.getByText("E2E-DH-M501-T1", { exact: true })).toBeVisible();

  await tabs.getByRole("tab", { name: /Đang làm/ }).click();
  await expect(page.getByText("E2E-DH-M501-T2", { exact: true })).toBeVisible();

  await tabs.getByRole("tab", { name: /Đã xong/ }).click();
  await expect(page.getByText("E2E-DH-M501-T3", { exact: true })).toBeVisible();

  const addressLink = page.getByRole("link", { name: /Nguyễn Trãi/ });
  await expect(addressLink).toHaveAttribute("href", /google\.com\/maps/);
  await expect(addressLink).toHaveAttribute("target", "_blank");
  const phoneLink = page.getByRole("link", { name: /0932/ });
  await expect(phoneLink).toHaveAttribute("href", "tel:0932068787");

  if (!isMobile(info)) {
    await expect(page.getByRole("table")).toBeVisible();
  }

  await evidence(page, info, isMobile(info) ? "my-tasks-390.png" : "my-tasks-1440.png");
});
