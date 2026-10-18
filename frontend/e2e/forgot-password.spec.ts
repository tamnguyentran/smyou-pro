import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Dedicated accounts (backend/scripts/seed_e2e.py) — not shared with other auth e2e tests, since
// this flow actually changes the account's password and must stay idempotent across `make e2e` runs
// (seed_e2e.py resets it to the seeded value below before every run).
const accountEmail = (info: TestInfo) => `mai.quenmk.${info.project.name}@smyou.vn`;

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

function shot(info: TestInfo, name: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, name);
}

async function resetTokenFor(page: Page, email: string): Promise<string> {
  const res = await page.request.get(
    `./api/v1/auth/_e2e/last-mail?email=${encodeURIComponent(email)}`,
  );
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { body: string };
  const match = /token=(\S+)/.exec(body.body);
  expect(match, `no reset link found in captured email: ${body.body}`).toBeTruthy();
  return match?.[1] ?? "";
}

test("AC-AUTH-052 link Quên mật khẩu? hiện ở trang Đăng nhập, vùng chạm ≥ 44px", async ({
  page,
}) => {
  await page.goto("./dang-nhap");
  const link = page.getByRole("link", { name: "Quên mật khẩu?" });
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await link.click();
  await expect(page).toHaveURL(/\/smyoutask\/quen-mat-khau$/);
});

test("AC-AUTH-059 AC-AUTH-063 @a11y @screenshot luồng đầy đủ quên/đặt lại mật khẩu", async ({
  page,
}, info) => {
  const email = accountEmail(info);
  const newPassword = "QuenMoi@E2E2";

  await page.goto("./quen-mat-khau");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { name: "Quên mật khẩu" })).toBeVisible();
  {
    const axe = await new AxeBuilder({ page }).analyze();
    const blocking = axe.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }
  await noHorizontalScroll(page);
  await page.screenshot({ path: shot(info, "forgot-password.png"), fullPage: true });

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi liên kết" }).click();
  await expect(page.getByRole("link", { name: "Về trang đăng nhập" })).toBeVisible();

  const token = await resetTokenFor(page, email);
  await page.goto(`./reset-password?token=${token}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { name: "Đặt lại mật khẩu" })).toBeVisible();
  {
    const axe = await new AxeBuilder({ page }).analyze();
    const blocking = axe.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }
  await noHorizontalScroll(page);
  await page.screenshot({ path: shot(info, "reset-password.png"), fullPage: true });

  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(newPassword);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(newPassword);
  await page.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.");
  await expect(page).toHaveURL(/\/smyoutask\/dang-nhap/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  // Reopening the link alone shows the form again (AC-AUTH-058 — opening never pre-validates the
  // token); only a submit attempt reveals it's already used (AC-AUTH-061).
  await page.goto(`./reset-password?token=${token}`);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(newPassword);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(newPassword);
  await page.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await expect(
    page.getByText("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."),
  ).toBeVisible();
});
