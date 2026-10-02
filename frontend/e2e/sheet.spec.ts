import { expect, test, type Page } from "@playwright/test";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";

async function openCustomerForm(page: Page) {
  await page.goto(`./dang-nhap?next=${encodeURIComponent("/customers")}`);
  await page.getByLabel("Email").fill(MANAGER);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.getByRole("button", { name: "Thêm khách hàng" }).click();
  return page.getByRole("dialog", { name: "Thêm khách hàng" });
}

async function expectChromeVisible(page: Page, dialog: ReturnType<Page["getByRole"]>) {
  const height = page.viewportSize()?.height ?? 0;
  const body = dialog.getByTestId("sheet-body");
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  for (const part of ["sheet-header", "sheet-footer"]) {
    const box = await dialog.getByTestId(part).boundingBox();
    expect(box).not.toBeNull();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
  }
  const panel = await dialog.getByTestId("sheet-panel").boundingBox();
  expect(panel?.height ?? Infinity).toBeLessThanOrEqual(height * 0.85 + 1);
}

test("AC-SYS-083 AC-SYS-084 AC-SYS-092 tiêu đề + footer luôn trong khung nhìn khi body cuộn", async ({
  page,
}, info) => {
  // Ép body phải cuộn: khung thấp hơn chiều cao form.
  const width = info.project.name === "mobile" ? 390 : 1440;
  await page.setViewportSize({ width, height: 420 });
  const dialog = await openCustomerForm(page);
  await expect(dialog).toBeVisible();
  const bodyOverflows = await dialog
    .getByTestId("sheet-body")
    .evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(bodyOverflows).toBe(true);
  await expectChromeVisible(page, dialog);
  await expect(dialog.getByRole("heading", { name: "Thêm khách hàng" })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Lưu" })).toBeInViewport();
  if (width === 1440) {
    const panel = await dialog.getByTestId("sheet-panel").boundingBox();
    expect(panel?.width ?? Infinity).toBeLessThanOrEqual(512);
  }
  const noHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(noHorizontalScroll).toBe(true);
  const footerClass = (await dialog.getByTestId("sheet-footer").getAttribute("class")) ?? "";
  expect(footerClass).toMatch(/safe-area-inset-bottom/);
});

test("AC-SYS-089 footer bấm được khi form lỗi trên mobile; lỗi hiện trong body", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "chỉ kiểm trên mobile");
  await page.setViewportSize({ width: 390, height: 420 });
  const dialog = await openCustomerForm(page);
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(dialog.getByTestId("sheet-body").getByRole("alert").first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Lưu" })).toBeInViewport();
});
