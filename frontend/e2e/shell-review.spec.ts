import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Review M1-03a (round 1): touch targets in the real shell, and evidence for the non-default states.
const PASSWORD = "E2e@SmYou2026";
const TECH_LEAD = "tuan.lead@smyou.vn";
const TECHNICIAN = "khoa.shell@smyou.vn";
const isMobile = (info: TestInfo) => info.project.name === "mobile";

async function signIn(page: Page, email: string, path: string) {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

async function openMenu(page: Page, info: TestInfo) {
  if (isMobile(info)) await page.getByRole("button", { name: "Mở menu" }).click();
  const nav = page.getByRole("navigation", { name: "Menu chính" });
  await expect(nav.getByRole("link", { name: "Tổng quan" })).toBeVisible();
  return nav;
}

async function allTargetsAtLeast44(page: Page) {
  const controls = page.locator("button:visible, a:visible");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const box = await controls.nth(i).boundingBox();
    const label = (await controls.nth(i).textContent()) ?? "";
    expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44);
  }
}

const shot = (info: TestInfo, file: string) =>
  resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);

test("AC-SYS-045 mọi nút và liên kết trong khung cao ≥ 44px (menu đóng và mở)", async ({
  page,
}, info) => {
  await signIn(page, TECH_LEAD, "/dispatch/board");
  await expect(page.getByRole("heading", { level: 1, name: "Bảng đầu việc" })).toBeVisible();
  await allTargetsAtLeast44(page);
  await openMenu(page, info);
  await allTargetsAtLeast44(page);
  await page.screenshot({ path: shot(info, "shell-group-open.png"), fullPage: true });
});

test("AC-SYS-041 AC-SYS-042 AC-SYS-043 @screenshot trang 403, 404, đang phát triển", async ({
  page,
}, info) => {
  await signIn(page, TECHNICIAN, "/employees");
  await expect(page.getByText("Bạn không có quyền truy cập trang này.")).toBeVisible();
  await page.screenshot({ path: shot(info, "page-403.png"), fullPage: true });

  await page.goto("./khong-co-trang-nay");
  await expect(page.getByText("Không tìm thấy trang.")).toBeVisible();
  await page.screenshot({ path: shot(info, "page-404.png"), fullPage: true });

  await page.goto("./my-tasks");
  await expect(page.getByText("Tính năng đang được phát triển.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Việc của tôi" })).toBeVisible();
  await page.screenshot({ path: shot(info, "page-coming-soon.png"), fullPage: true });
});
