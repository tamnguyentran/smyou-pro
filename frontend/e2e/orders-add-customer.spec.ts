import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// M20-04: "Thêm khách hàng" ngay trong màn tạo đơn — sau khi đã thêm dòng hàng (nháp tạo ngầm).
const PASSWORD = "E2e@SmYou2026";
const SALE = "hoa.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/orders/new") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

/** A phone no earlier run used — a reused one would trip the duplicate-phone warning (AC-UI-068),
 * which keeps the modal open on purpose. */
function freshPhone() {
  // Random, not Date.now(): mobile and desktop run in parallel and may hit the same millisecond.
  return `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

async function startOrderWithLine(page: Page) {
  await signIn(page, SALE);
  await expect(page.getByRole("heading", { level: 1, name: "Tạo đơn mới" })).toBeVisible();
  await page.getByLabel("Nhóm sản phẩm/dịch vụ").selectOption({ label: "Kỹ thuật chung" });
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const sheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await sheet.getByLabel("Tìm sản phẩm").fill("dell");
  await sheet.getByRole("button", { name: /Màn hình Dell 22 inch E2E/ }).click();
  await expect(page.getByText("Màn hình Dell 22 inch E2E")).toBeVisible();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
}

for (const [ac, typeLabel, baseName, taxCode] of [
  ["AC-UI-065", "Cá nhân", "Nguyễn Thị Lan", null],
  ["AC-UI-066", "Công ty", "Công ty TNHH Minh Phát", "0312345678"],
] as const) {
  test(`${ac} thêm khách ${typeLabel} sau khi đã thêm dòng hàng → khách được chọn, Lưu nháp, tải lại vẫn còn`, async ({
    page,
  }) => {
    const name = `${baseName} ${String(Date.now()).slice(-5)}`;
    const phone = freshPhone();
    await startOrderWithLine(page);

    await page.getByRole("button", { name: "Thêm khách hàng" }).click();
    const dialog = page.getByRole("dialog", { name: "Thêm khách hàng" });
    await dialog.getByLabel("Loại khách hàng").selectOption({ label: typeLabel });
    await dialog.getByLabel("Tên khách hàng").fill(name);
    await dialog.getByLabel("Số điện thoại").fill(phone);
    if (taxCode) await dialog.getByLabel("Mã số thuế").fill(taxCode);
    await dialog.getByRole("button", { name: "Lưu" }).click();

    // Any dialog, not just "Thêm khách hàng": a duplicate-phone warning re-titles it "Sửa khách hàng".
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(`Đã thêm khách hàng ${name}.`)).toBeVisible();
    await expect(page.getByLabel("Tìm khách hàng")).toHaveValue(name);
    await expect(page.getByText(phone)).toBeVisible();
    // Bấm "Lưu" của khách không được kéo theo "Lưu nháp" của đơn (submit lồng form).
    await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toHaveCount(0);

    const save = page.getByRole("button", { name: "Lưu nháp" });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Tìm khách hàng")).toHaveValue(name);
  });
}

test("AC-UI-069 @screenshot modal Thêm khách hàng (công ty) dài: lỗi 422 ở ô cuối → thấy lỗi không cần tự cuộn, nút ≥44px", async ({
  page,
}, info) => {
  const message = "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.";
  await page.route("**/api/v1/customers", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 422,
      contentType: "application/problem+json",
      body: JSON.stringify({
        status: 422,
        code: "VALIDATION_ERROR",
        detail: "Dữ liệu không hợp lệ.",
        errors: [{ field: "it_contact_phone", code: "invalid", message }],
      }),
    });
  });
  await startOrderWithLine(page);

  await page.getByRole("button", { name: "Thêm khách hàng" }).click();
  const dialog = page.getByRole("dialog", { name: "Thêm khách hàng" });
  await dialog.getByLabel("Loại khách hàng").selectOption({ label: "Công ty" });
  await dialog.getByLabel("Tên khách hàng").fill("Công ty TNHH Minh Phát");
  await dialog.getByLabel("Số điện thoại").fill(freshPhone());
  await dialog.getByLabel("Tên khách hàng").focus();
  const save = dialog.getByRole("button", { name: "Lưu" });
  await save.click();

  const lastField = dialog.getByLabel("SĐT phụ trách IT");
  await expect(lastField).toBeFocused();
  await expect(dialog.getByText(message)).toBeInViewport();
  await expect(dialog).toBeVisible();
  expect((await save.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: shot(info, "order-add-customer-error.png") });
});
