import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const ACCOUNTS = {
  manager: { email: "an.e2e@smyou.vn", name: "Nguyễn Văn An" },
  sale: { email: "hoa.e2e@smyou.vn", name: "Lê Thị Hoa" },
  "tech-lead": { email: "tuan.lead@smyou.vn", name: "Phạm Quốc Tuấn" },
  technician: { email: "khoa.shell@smyou.vn", name: "Trần Minh Khoa" },
} as const;
type Role = keyof typeof ACCOUNTS;

const MENUS: Record<Role, string[]> = {
  manager: [
    "Tổng quan",
    "Đơn hàng",
    "Danh mục",
    "Nhân sự & phân quyền",
    "Báo cáo KPI",
    "Nhật ký hệ thống",
  ],
  sale: ["Tổng quan", "Đơn hàng"],
  "tech-lead": ["Tổng quan", "Điều phối kỹ thuật", "Báo cáo KPI"],
  technician: ["Tổng quan", "Việc của tôi", "Báo cáo KPI"],
};

async function signIn(page: Page, role: Role, path = "/") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(ACCOUNTS[role].email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

const isMobile = (info: TestInfo) => info.project.name === "mobile";

/** On phones the menu lives in the drawer: open it first. */
async function menu(page: Page, info: TestInfo) {
  if (isMobile(info)) await page.getByRole("button", { name: "Mở menu" }).click();
  return page.getByRole("navigation", { name: "Menu chính" });
}

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file),
    fullPage: true,
  });
}

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  test(`AC-SYS-035 AC-SYS-046 @a11y @screenshot menu của ${role}`, async ({ page }, info) => {
    await signIn(page, role);
    await expect(page.getByText(`Xin chào, ${ACCOUNTS[role].name}`)).toBeVisible();
    await evidence(page, info, `shell-${role}.png`);

    const nav = await menu(page, info);
    await expect(nav.getByRole("link", { name: "Tổng quan" })).toBeVisible(); // /me loaded
    const labels = await nav
      .locator(":scope > ul > li > :is(a, button) [data-menu-label]")
      .allTextContents();
    expect(labels).toEqual(MENUS[role]);
    if (isMobile(info)) {
      await evidence(page, info, `shell-${role}-drawer.png`);
      await page.setViewportSize({ width: 360, height: 780 });
      await evidence(page, info, `shell-${role}-360.png`);
    }
  });
}

test("AC-SYS-038 AC-SYS-039 mục đang chọn, nhóm tự mở; desktop có sidebar + nút Tạo đầu việc, mobile có menu trượt", async ({
  page,
}, info) => {
  await signIn(page, "tech-lead", "/dispatch/board");
  await expect(page.getByRole("heading", { level: 1, name: "Bảng đầu việc" })).toBeVisible();

  const open = page.getByRole("button", { name: "Mở menu" });
  if (isMobile(info)) {
    await expect(page.getByRole("navigation", { name: "Menu chính" })).toBeHidden();
    const box = await open.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await open.click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  } else {
    await expect(open).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Tạo đầu việc" })).toBeVisible();
  }

  const nav = page.getByRole("navigation", { name: "Menu chính" });
  await expect(nav.getByRole("link", { name: "Bảng đầu việc" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("button", { name: "Điều phối kỹ thuật" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  if (isMobile(info)) {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
    await expect(open).toBeFocused();
  }
});

test("AC-SYS-040 đăng xuất từ menu", async ({ page }, info) => {
  await signIn(page, "manager");
  await expect(page.getByText("Xin chào, Nguyễn Văn An")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "Đăng xuất" })).toHaveCount(0);
  await menu(page, info);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/smyoutask\/dang-nhap/);
  await page.goBack();
  await expect(page).toHaveURL(/\/smyoutask\/dang-nhap/);
});

test("AC-SYS-041 KTV mở trang Nhân sự → 403", async ({ page }) => {
  await signIn(page, "technician", "/employees");
  await expect(page.getByText("Bạn không có quyền truy cập trang này.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Về trang chủ" })).toBeVisible();
});

test("AC-SYS-042 đường dẫn lạ → 404", async ({ page }) => {
  await signIn(page, "manager", "/khong-co-trang-nay");
  await expect(page.getByText("Không tìm thấy trang.")).toBeVisible();
});
