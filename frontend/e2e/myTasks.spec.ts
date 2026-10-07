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

// M5-02: 1 (chấp nhận, từ chối) cho mỗi project — order riêng mỗi project (xem
// backend/scripts/seed_e2e.py#RESPOND_ORDERS) để 2 project chạy song song không đụng version.
function respondOrderCode(info: TestInfo) {
  return isMobile(info) ? "E2E-DH-M502A" : "E2E-DH-M502B";
}

function rowFor(page: Page, taskCode: string) {
  return page.locator(`li:has-text("${taskCode}"), tr:has-text("${taskCode}")`).first();
}

test("AC-ASG-040 AC-ASG-041 @a11y tiếp nhận 1 thẻ, từ chối 1 thẻ khác, không cuộn ngang, axe sạch", async ({
  page,
}, info) => {
  const orderCode = respondOrderCode(info);
  const acceptCode = `${orderCode}-T1`;
  const rejectCode = `${orderCode}-T2`;

  await signIn(page, "/my-tasks");
  const tabs = page.getByRole("tablist", { name: "Việc của tôi" });
  await tabs.getByRole("tab", { name: /Chờ nhận/ }).click();
  await expect(page.getByText(acceptCode, { exact: true })).toBeVisible();

  await rowFor(page, acceptCode).getByRole("button", { name: "Tiếp nhận" }).click();
  await expect(page.getByText("Đã tiếp nhận đầu việc.")).toBeVisible();
  await expect(page.getByText(acceptCode, { exact: true })).not.toBeVisible();

  await rowFor(page, rejectCode).getByRole("button", { name: "Từ chối" }).click();
  const dialog = page.getByRole("dialog", { name: `Từ chối đầu việc ${rejectCode}?` });
  await dialog.getByLabel("Lý do từ chối").selectOption({ label: "Không phù hợp chuyên môn" });
  await dialog.getByLabel("Lý do chi tiết").fill("Không có kỹ năng lắp camera loại này");
  await dialog.getByRole("button", { name: "Xác nhận từ chối" }).click();
  await expect(page.getByText("Đã từ chối đầu việc.")).toBeVisible();
  await expect(page.getByText(rejectCode, { exact: true })).not.toBeVisible();

  await evidence(
    page,
    info,
    isMobile(info) ? "my-tasks-respond-390.png" : "my-tasks-respond-1440.png",
  );
});
