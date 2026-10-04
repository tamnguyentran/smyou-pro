import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";
const TECHNICIAN = "khoa.shell@smyou.vn";

async function signIn(page: Page, email: string, path = "/catalog/services") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

/** Same convention as products.spec.ts: `checkOverflow` only safe when no open Sheet needs to
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

test("AC-CAT-027 AC-CAT-032 @a11y @screenshot danh sách Dịch vụ (Manager)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Dịch vụ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm dịch vụ" })).toBeVisible();
  // Lọc theo mã cố định của fixture — dev DB tích lũy nhiều dịch vụ thủ công nên
  // E2E-DV-001 không chắc còn ở trang 1 nếu không lọc (M4-03c).
  await page.getByLabel("Tìm kiếm").fill("E2E-DV-001");
  // .first(): tránh strict-mode lỗi nếu có dịch vụ khác trùng chuỗi con (M4-03c review).
  await expect(page.getByText("E2E-DV-001").first()).toBeVisible();
  // no further interaction after this — safe to also check the 360px breakpoint
  await evidence(page, info, "services.png", { checkOverflow: true });
});

test("AC-CAT-028 AC-CAT-032 @a11y @screenshot thêm dịch vụ", async ({ page }, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm dịch vụ" }).click();
  const form = page.getByRole("dialog", { name: "Thêm dịch vụ" });
  await expect(form).toBeVisible();

  const code = `QA-DV-${String(Date.now())}`;
  await form.getByLabel("Mã dịch vụ").fill(code);
  await form.getByLabel("Tên dịch vụ").fill("Dịch vụ QA E2E");
  await form.getByLabel("Nhóm dịch vụ").selectOption("OTHER");
  await form.getByLabel("Đơn vị tính").selectOption("LAN");
  await form.getByLabel("Đơn giá (chưa VAT)").fill("150000");
  await evidence(page, info, "service-form.png");

  await form.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã thêm dịch vụ Dịch vụ QA E2E.")).toBeVisible();
  // Cùng Sheet chuyển sang chế độ sửa cho dịch vụ vừa tạo (như M2-01b)
  await expect(page.getByRole("dialog", { name: "Sửa dịch vụ" })).toBeVisible();
});

test("AC-CAT-030 ngừng kinh doanh, badge đổi ngay không cần tải lại", async ({ page }) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm dịch vụ" }).click();
  const form = page.getByRole("dialog", { name: "Thêm dịch vụ" });
  const code = `QA-DV-STOP-${String(Date.now())}`;
  await form.getByLabel("Mã dịch vụ").fill(code);
  await form.getByLabel("Tên dịch vụ").fill("QA Ngừng kinh doanh");
  await form.getByLabel("Nhóm dịch vụ").selectOption("OTHER");
  await form.getByLabel("Đơn vị tính").selectOption("LAN");
  await form.getByLabel("Đơn giá (chưa VAT)").fill("100000");
  await form.getByRole("button", { name: "Lưu" }).click();

  const editDialog = page.getByRole("dialog", { name: "Sửa dịch vụ" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByRole("button", { name: "Ngừng kinh doanh" }).click();
  const confirm = page.getByRole("dialog", { name: "Ngừng kinh doanh" });
  await expect(confirm.getByText("Dịch vụ sẽ không hiện khi tạo đơn mới.")).toBeVisible();
  await confirm.getByRole("button", { name: "Ngừng kinh doanh" }).click();
  await expect(editDialog.getByText("Đã ngừng kinh doanh")).toBeVisible();
  await expect(editDialog.getByRole("button", { name: "Mở lại kinh doanh" })).toBeVisible();
});

test("AC-CAT-031 Sale (chỉ đọc): không có nút Thêm/Sửa/Ngừng", async ({ page }) => {
  await signIn(page, SALE);
  await expect(page.getByRole("heading", { level: 1, name: "Dịch vụ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm dịch vụ" })).toHaveCount(0);
  // Lọc theo tên cố định của fixture — xem ghi chú ở test AC-CAT-027 (M4-03c).
  await page.getByLabel("Tìm kiếm").fill("Lắp đặt camera E2E");
  // .first(): tránh strict-mode lỗi nếu có dịch vụ khác trùng chuỗi con (M4-03c review).
  await page.getByText("Lắp đặt camera E2E").first().click();
  const dialog = page.getByRole("dialog", { name: "Chi tiết dịch vụ" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Lưu" })).toHaveCount(0);
});

test("AC-CAT-031 Khoa (TECHNICIAN) mở /catalog/services trực tiếp → 403", async ({ page }) => {
  await signIn(page, TECHNICIAN);
  await expect(page.getByText("Bạn không có quyền truy cập trang này.")).toBeVisible();
});

test("AC-CAT-032 không cuộn ngang ở 360px (danh sách, form thêm)", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const noHorizontalScroll = async () => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  };

  await signIn(page, MANAGER);
  await expect(page.getByRole("button", { name: "Thêm dịch vụ" })).toBeVisible();
  await noHorizontalScroll(); // danh sách

  await page.getByRole("button", { name: "Thêm dịch vụ" }).click();
  const form = page.getByRole("dialog", { name: "Thêm dịch vụ" });
  await expect(form).toBeVisible();
  const code = `QA360-DV-${String(Date.now())}-${info.project.name}`;
  await form.getByLabel("Mã dịch vụ").fill(code);
  await form.getByLabel("Tên dịch vụ").fill("QA 360px");
  await form.getByLabel("Nhóm dịch vụ").selectOption("OTHER");
  await form.getByLabel("Đơn vị tính").selectOption("LAN");
  await form.getByLabel("Đơn giá (chưa VAT)").fill("1000");
  await noHorizontalScroll(); // form thêm dịch vụ
});
