import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const SALE = "hoa.e2e@smyou.vn";
const TECH_LEAD = "tuan.lead@smyou.vn";
const TECHNICIAN = "duc.ktv3@smyou.vn";
const MANAGER = "an.e2e@smyou.vn";
const CUSTOMER_CARE = "lan.cskh@smyou.vn";

async function signIn(page: Page, email: string, path: string) {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  // Sidebar nav "active" background still has a CSS transition `document.getAnimations()`
  // doesn't always report finished for right after a client-side navigation; without this,
  // axe occasionally samples the sidebar mid-transition (flaky color-contrast on the old item).
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, file), fullPage: true });
}

test("AC-DASH-077 AC-DASH-078 AC-DASH-085 AC-DASH-031 @a11y @screenshot Hoa (SALE) bấm thẻ 'Chờ điều phối' → popup danh sách, URL không đổi; Excel chỉ desktop", async ({
  page,
}, info) => {
  await signIn(page, SALE, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const orderSection = page.locator("section", {
    has: page.getByRole("heading", { name: "Đơn theo trạng thái" }),
  });
  const tile = orderSection.getByRole("button", { name: /Chờ điều phối/ });
  const count = (await tile.locator("p").nth(1).textContent())?.trim() ?? "";
  await evidence(page, info, "dashboard-card-tiles.png");

  await tile.click();
  const dialog = page.getByRole("dialog", { name: `Chờ điều phối (${count})` });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const labelledBy = await dialog.getAttribute("aria-labelledby");
  expect(labelledBy).toBeTruthy();
  await expect(page.locator(`[id="${labelledBy ?? ""}"]`)).toHaveText(`Chờ điều phối (${count})`);

  // Bằng chứng ảnh phải có dòng thật (seed có đơn Chờ điều phối của Hoa), không phải trạng thái rỗng.
  expect(count).not.toBe("0");
  await expect(dialog.getByRole("link").first()).toBeVisible();

  const size = page.viewportSize();
  const desktop = (size?.width ?? 0) >= 1024;
  if (desktop) {
    await expect(dialog.getByRole("columnheader", { name: "Mã đơn" })).toBeVisible();
    if (count !== "0") {
      await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toBeVisible();
    }
  } else {
    await expect(dialog.getByTestId("sheet-panel")).toHaveClass(/bottom-0/);
    await expect(dialog.getByRole("table")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toHaveCount(0);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(overflow).toBe(true);
  await evidence(page, info, "dashboard-card-popup-pending-dispatch.png");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(tile).toBeFocused();
});

test("AC-DASH-079 AC-DASH-085 @a11y @screenshot Tuấn (TECH_LEAD) bấm 'Quá hạn' (khối Điều phối) → popup 'Đầu việc quá hạn'", async ({
  page,
}, info) => {
  await signIn(page, TECH_LEAD, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const dispatchSection = page.locator("section", {
    has: page.getByRole("heading", { name: "Điều phối" }),
  });
  await dispatchSection.getByRole("button", { name: /Quá hạn/ }).click();
  const dialog = page.getByRole("dialog", { name: /^Đầu việc quá hạn \([1-9]\d*\)$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("link").first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await evidence(page, info, "dashboard-card-popup-overdue-tasks.png");
});

async function openPopup(page: Page, section: string, tile: RegExp) {
  const block = page.locator("section", { has: page.getByRole("heading", { name: section }) });
  const button = block.getByRole("button", { name: tile });
  await expect(button).toHaveAttribute("aria-haspopup", "dialog");
  await button.click();
  return button;
}

async function noHorizontalScroll(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(fits).toBe(true);
}

test("AC-DASH-098 AC-DASH-103 @a11y @screenshot Tuấn (TECH_LEAD) bấm thẻ khối Đầu việc + Nhân sự → popup, URL không đổi", async ({
  page,
}, info) => {
  await signIn(page, TECH_LEAD, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  await openPopup(page, "Đầu việc theo trạng thái", /Cần giao lại/);
  const tasks = page.getByRole("dialog", { name: /^Cần giao lại \([1-9]\d*\)$/ });
  await expect(tasks).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(tasks.getByRole("link").first()).toHaveAttribute("href", /\/orders\//);
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  if (desktop) {
    await expect(tasks.getByRole("columnheader", { name: "KTV" })).toBeVisible();
    await expect(tasks.getByRole("button", { name: /Xuất Excel/ })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(tasks).toHaveCount(0);

  const tile = await openPopup(page, "Nhân sự kỹ thuật", /Chờ giao việc/);
  const staff = page.getByRole("dialog", { name: /^Chờ giao việc \(\d+\)$/ });
  await expect(staff).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-staff.png");
  await page.keyboard.press("Escape");
  await expect(staff).toHaveCount(0);
  await expect(tile).toBeFocused();
});

test("AC-DASH-100 AC-DASH-103 @a11y @screenshot Đức (TECHNICIAN) bấm 'Quá hạn chưa hoàn thành' → chỉ việc của Đức; mobile là sheet, không Excel", async ({
  page,
}, info) => {
  await signIn(page, TECHNICIAN, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  await openPopup(page, "Đầu việc của tôi", /Quá hạn chưa hoàn thành/);
  const dialog = page.getByRole("dialog", { name: /^Quá hạn chưa hoàn thành \([1-9]\d*\)$/ });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog.getByText("E2E-DH-M1801C-T1")).toBeVisible();
  await expect(dialog.getByText("Đã nhận")).toBeVisible();
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  if (desktop) {
    await expect(dialog.getByRole("columnheader", { name: "Trạng thái" })).toBeVisible();
    await expect(dialog.getByRole("columnheader", { name: "KTV" })).toHaveCount(0);
  } else {
    await expect(dialog.getByTestId("sheet-panel")).toHaveClass(/bottom-0/);
    await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toHaveCount(0);
  }
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-my-overdue.png");
});

test("AC-DASH-054 AC-DASH-056 AC-DASH-058 AC-DASH-059 @a11y @screenshot An (MANAGER) thấy Top 10 khách hàng + tổng hợp đánh giá trên Tổng quan", async ({
  page,
}, info) => {
  await signIn(page, MANAGER, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  await expect(page.getByText("Top 10 khách hàng (tháng này)")).toBeVisible();
  await expect(page.getByText("E2E-KH-001")).toBeVisible();
  await expect(page.getByText("Phản hồi – đánh giá từ khách hàng (tháng này)")).toBeVisible();
  await expect(page.getByText("5★")).toBeVisible();

  await evidence(page, info, "dashboard-top-customers-feedback-summary.png");
});

test("AC-DASH-116 AC-DASH-120 AC-DASH-122 @a11y @screenshot Lan (CSKH) bấm 'Khách hàng đã chăm sóc' + '2★' → popup phản hồi; mobile là sheet, không Excel", async ({
  page,
}, info) => {
  await signIn(page, CUSTOMER_CARE, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;

  const tile = await openPopup(page, "Chăm sóc khách hàng (tháng này)", /Khách hàng đã chăm sóc/);
  const care = page.getByRole("dialog", { name: /^Khách hàng đã chăm sóc \([1-9]\d*\)$/ });
  await expect(care).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(care.getByRole("link").first()).toHaveAttribute("href", /\/orders\//);
  if (desktop) {
    await expect(care.getByRole("columnheader", { name: "Số sao" })).toBeVisible();
    await expect(care.getByRole("button", { name: /Xuất Excel/ })).toBeVisible();
  } else {
    await expect(care.getByTestId("sheet-panel")).toHaveClass(/bottom-0/);
    await expect(care.getByRole("button", { name: /Xuất Excel/ })).toHaveCount(0);
  }
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-care-customers.png");
  await page.keyboard.press("Escape");
  await expect(care).toHaveCount(0);
  await expect(tile).toBeFocused();

  await openPopup(page, "Phản hồi – đánh giá từ khách hàng (tháng này)", /^2★/);
  const twoStars = page.getByRole("dialog", { name: /^Đánh giá 2★ \([1-9]\d*\)$/ });
  await expect(twoStars).toBeVisible();
  await expect(twoStars.getByText("2★").first()).toBeVisible();
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-feedback.png");
});

test("AC-DASH-119 AC-DASH-120 AC-DASH-122 @a11y @screenshot An (MANAGER) bấm khách E2E-KH-001 trong Top 10 → popup đơn hoàn tất của khách", async ({
  page,
}, info) => {
  await signIn(page, MANAGER, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  await openPopup(page, "Top 10 khách hàng (tháng này)", /E2E-KH-001/);
  const dialog = page.getByRole("dialog", { name: /\(E2E-KH-001\) \([1-9]\d*\)$/ });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog.getByRole("link", { name: "E2E-DH-M1504A" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toBeVisible();
  } else {
    await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toHaveCount(0);
  }
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-top-customer.png");
});
