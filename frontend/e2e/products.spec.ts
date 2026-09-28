import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";
const TECHNICIAN = "khoa.shell@smyou.vn";

async function signIn(page: Page, email: string, path = "/catalog/products") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

/** Same convention as employees.spec.ts: `checkOverflow` only safe when no open Sheet needs to
 * survive it — crossing 1024px remounts AppShell's outlet and drops sheet state. */
async function evidence(
  page: Page,
  info: TestInfo,
  file: string,
  { checkOverflow = false }: { checkOverflow?: boolean } = {},
) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, file), fullPage: true });
  if (!checkOverflow) return;
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

test("AC-CAT-012 AC-CAT-018 @a11y @screenshot danh sách Sản phẩm (Manager)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Sản phẩm" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm sản phẩm" })).toBeVisible();
  await expect(page.getByText("E2E-MON-001")).toBeVisible();
  // no further interaction after this — safe to also check the 360px breakpoint
  await evidence(page, info, "products.png", { checkOverflow: true });
});

test("AC-CAT-013 AC-CAT-018 @a11y @screenshot thêm sản phẩm", async ({ page }, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm sản phẩm" }).click();
  const form = page.getByRole("dialog", { name: "Thêm sản phẩm" });
  await expect(form).toBeVisible();

  const sku = `QA${String(Date.now())}`;
  await form.getByLabel("Mã hàng").fill(sku);
  await form.getByLabel("Tên sản phẩm").fill("PC SMYOU QA E2E");
  await form.getByLabel("Danh mục").selectOption("PC");
  await form.getByLabel("Đơn vị tính").selectOption("BO");
  await form.getByLabel("Đơn giá").fill("12500000");
  await evidence(page, info, "product-form.png");

  await form.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã thêm sản phẩm PC SMYOU QA E2E.")).toBeVisible();
  // §8 giả định: cùng Sheet chuyển sang chế độ sửa cho sản phẩm vừa tạo
  await expect(page.getByRole("dialog", { name: "Sửa sản phẩm" })).toBeVisible();
});

test("AC-CAT-015 ngừng kinh doanh, badge đổi ngay không cần tải lại", async ({ page }) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm sản phẩm" }).click();
  const form = page.getByRole("dialog", { name: "Thêm sản phẩm" });
  const sku = `QA-STOP-${String(Date.now())}`;
  await form.getByLabel("Mã hàng").fill(sku);
  await form.getByLabel("Tên sản phẩm").fill("QA Ngừng kinh doanh");
  await form.getByLabel("Danh mục").selectOption("ACCESSORY");
  await form.getByLabel("Đơn vị tính").selectOption("CAI");
  await form.getByLabel("Đơn giá").fill("100000");
  await form.getByRole("button", { name: "Lưu" }).click();

  const editDialog = page.getByRole("dialog", { name: "Sửa sản phẩm" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByRole("button", { name: "Ngừng kinh doanh" }).click();
  const confirm = page.getByRole("dialog", { name: "Ngừng kinh doanh" });
  await expect(confirm.getByText("Sản phẩm sẽ không hiện khi tạo đơn mới.")).toBeVisible();
  await confirm.getByRole("button", { name: "Ngừng kinh doanh" }).click();
  await expect(editDialog.getByText("Đã ngừng kinh doanh")).toBeVisible();
  await expect(editDialog.getByRole("button", { name: "Mở lại kinh doanh" })).toBeVisible();
});

test("AC-CAT-016 @a11y @screenshot tải ảnh sản phẩm: xem trước → tiến trình → hiện ảnh", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByText("Màn hình Dell 22 inch E2E").click();
  const dialog = page.getByRole("dialog", { name: "Sửa sản phẩm" });
  await expect(dialog).toBeVisible();

  // A real (decodable) 4×4 JPEG — unlike the backend's magic-byte-only fixtures, the browser's
  // createImageBitmap() (used by compressImage) needs actual valid image data, not just headers.
  const jpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABAAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z",
    "base64",
  );
  await dialog
    .getByLabel("Chọn ảnh", { exact: false })
    .setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await expect(dialog.getByAltText("Ảnh sản phẩm")).toBeVisible({ timeout: 15_000 });
  await evidence(page, info, "product-image.png");
});

test("AC-CAT-017 Sale (chỉ đọc): không có nút Thêm/Sửa/Ngừng", async ({ page }) => {
  await signIn(page, SALE);
  await expect(page.getByRole("heading", { level: 1, name: "Sản phẩm" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm sản phẩm" })).toHaveCount(0);
  await page.getByText("Màn hình Dell 22 inch E2E").click();
  const dialog = page.getByRole("dialog", { name: "Chi tiết sản phẩm" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Lưu" })).toHaveCount(0);
});

test("AC-CAT-017 Khoa (TECHNICIAN) mở /catalog/products trực tiếp → 403", async ({ page }) => {
  await signIn(page, TECHNICIAN);
  await expect(page.getByText("Bạn không có quyền truy cập trang này.")).toBeVisible();
});

test("AC-CAT-018 không cuộn ngang ở 360px (danh sách, form thêm)", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const noHorizontalScroll = async () => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  };

  await signIn(page, MANAGER);
  await expect(page.getByRole("button", { name: "Thêm sản phẩm" })).toBeVisible();
  await noHorizontalScroll(); // danh sách

  await page.getByRole("button", { name: "Thêm sản phẩm" }).click();
  const form = page.getByRole("dialog", { name: "Thêm sản phẩm" });
  await expect(form).toBeVisible();
  const sku = `QA360-${String(Date.now())}-${info.project.name}`;
  await form.getByLabel("Mã hàng").fill(sku);
  await form.getByLabel("Tên sản phẩm").fill("QA 360px");
  await form.getByLabel("Danh mục").selectOption("OTHER");
  await form.getByLabel("Đơn vị tính").selectOption("CAI");
  await form.getByLabel("Đơn giá").fill("1000");
  await noHorizontalScroll(); // form thêm sản phẩm
});
