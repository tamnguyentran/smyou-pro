import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/catalog/products") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

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

function productsCsv(sku: string) {
  return [
    "sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs",
    `${sku},PC SMYOU QA IMPORT,PC,SMYOU,BO,8500000,8,true,24,I3-12100/8GB`,
  ].join("\n");
}

function servicesCsv(code: string) {
  return [
    "code,name,category,unit,price,vat_rate,price_fixed,default_estimated_hours,description",
    `${code},Vệ sinh QA import,MAINTENANCE,LAN,150000,8,true,1,`,
  ].join("\n");
}

test("AC-CAT-047 AC-CAT-058 @a11y @screenshot nhập sản phẩm: xem trước hợp lệ → xác nhận", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Nhập từ CSV" }).click();
  const dialog = page.getByRole("dialog", { name: "Nhập sản phẩm từ CSV" });
  await expect(dialog).toBeVisible();

  const sku = `QAIMP${String(Date.now())}${info.project.name}`;
  await dialog.getByLabel("Chọn file").setInputFiles({
    name: "products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(productsCsv(sku)),
  });
  await expect(dialog.getByText("1/1 dòng hợp lệ")).toBeVisible();
  // No checkOverflow here: it resizes across the 1024px breakpoint, which remounts AppShell's
  // outlet and drops open Sheet state (same caveat as products.spec.ts/employees.spec.ts) — this
  // test still needs the dialog open below. See AC-CAT-048 for the overflow check.
  await evidence(page, info, "catalog-import-preview.png");

  await dialog.getByRole("button", { name: "Xác nhận nhập" }).click();
  const confirm = page.getByRole("dialog", { name: "Xác nhận nhập" });
  await expect(confirm.getByText("Nhập 1 sản phẩm mới vào danh mục?")).toBeVisible();
  await confirm.getByRole("button", { name: "Xác nhận nhập" }).click();
  await expect(page.getByText("Đã nhập 1 sản phẩm.")).toBeVisible();
  await expect(dialog).toBeHidden();

  await page.getByLabel("Tìm kiếm").fill(sku);
  await expect(page.getByText(sku)).toBeVisible();
});

test("AC-CAT-048 @a11y @screenshot xem trước có dòng lỗi: nút Xác nhận nhập bị khoá", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Nhập từ CSV" }).click();
  const dialog = page.getByRole("dialog", { name: "Nhập sản phẩm từ CSV" });
  const csv = [
    "sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs",
    `QAERR${String(Date.now())},Sản phẩm lỗi,TIVI,SMYOU,BO,1000000,8,false,,`,
  ].join("\n");
  await dialog
    .getByLabel("Chọn file")
    .setInputFiles({ name: "products-bad.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(dialog.getByText("0/1 dòng hợp lệ · 1 dòng lỗi")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Xác nhận nhập" })).toBeDisabled();
  if (info.project.name === "mobile") {
    // AC-CAT-057: điện thoại hiện thẻ, không phải bảng.
    await expect(dialog.getByRole("table")).toHaveCount(0);
  }
  await evidence(page, info, "catalog-import-errors.png", { checkOverflow: true });
});

test("AC-CAT-055 Sale không thấy nút Nhập từ CSV", async ({ page }) => {
  await signIn(page, SALE);
  await expect(page.getByRole("heading", { level: 1, name: "Sản phẩm" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nhập từ CSV" })).toHaveCount(0);
});

test("AC-CAT-056 nhập dịch vụ từ CSV", async ({ page }) => {
  await signIn(page, MANAGER, "/catalog/services");
  await page.getByRole("button", { name: "Nhập từ CSV" }).click();
  const dialog = page.getByRole("dialog", { name: "Nhập dịch vụ từ CSV" });
  const code = `DV-QAIMP${String(Date.now())}`;
  await dialog.getByLabel("Chọn file").setInputFiles({
    name: "services.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(servicesCsv(code)),
  });
  await expect(dialog.getByText("1/1 dòng hợp lệ")).toBeVisible();
  await dialog.getByRole("button", { name: "Xác nhận nhập" }).click();
  const confirm = page.getByRole("dialog", { name: "Xác nhận nhập" });
  await confirm.getByRole("button", { name: "Xác nhận nhập" }).click();
  await expect(page.getByText("Đã nhập 1 dịch vụ.")).toBeVisible();

  await page.getByLabel("Tìm kiếm").fill(code);
  await expect(page.getByText(code)).toBeVisible();
});
