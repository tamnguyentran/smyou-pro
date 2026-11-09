import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";
const TECH_LEAD = "tuan.lead@smyou.vn";
const TECHNICIAN = "khoa.shell@smyou.vn";

async function signIn(page: Page, email: string, path = "/customers") {
  await page.goto("./dang-nhap");
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // UAT-05: sign-in always lands on Tổng quan; then open the page under test.
  await page.waitForURL(/\/smyoutask\/$/);
  await page.goto(`.${path}`);
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

/** Same convention as services.spec.ts: `checkOverflow` only safe when no open Sheet needs to
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

test("AC-CUS-009 AC-CUS-013 AC-UI-014 @a11y @screenshot danh sách Khách hàng (Manager)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Khách hàng" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm khách hàng" })).toBeVisible();
  await expect(page.getByText("E2E-KH-001")).toBeVisible();
  // no further interaction after this — safe to also check the 360px breakpoint
  await evidence(page, info, "customers.png", { checkOverflow: true });
});

test("AC-CUS-010 AC-CUS-013 @a11y @screenshot thêm khách hàng, cảnh báo trùng SĐT", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm khách hàng" }).click();
  const form = page.getByRole("dialog", { name: "Thêm khách hàng" });
  await expect(form).toBeVisible();

  await form.getByLabel("Tên khách hàng").fill("Khách hàng QA E2E");
  await form.getByLabel("Số điện thoại").fill("0909123456"); // trùng SĐT của E2E-KH-001
  await evidence(page, info, "customer-form.png");

  await form.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã thêm khách hàng Khách hàng QA E2E.")).toBeVisible();
  // Cùng Sheet chuyển sang chế độ sửa cho khách hàng vừa tạo (như M2-01b/M2-02)
  await expect(page.getByRole("dialog", { name: "Sửa khách hàng" })).toBeVisible();
  // Không đòi hỏi khớp toàn bộ chuỗi: các lần chạy trước (mobile/desktop, hoặc chạy lại cục bộ) có
  // thể đã để lại khách hàng khác cùng SĐT — banner liệt kê thêm tên, KH00001 luôn đứng đầu vì sắp
  // theo mã và "E2E-" < "KH" (bảng chữ cái).
  await expect(
    page.getByText("SĐT này đã dùng cho: Cty Sáng Tạo Mới E2E (E2E-KH-001)", { exact: false }),
  ).toBeVisible();
});

test("AC-CUS-012 Sale quản lý được (customer.manage all, không phải own)", async ({ page }) => {
  await signIn(page, SALE);
  await expect(page.getByRole("heading", { level: 1, name: "Khách hàng" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm khách hàng" })).toBeVisible();
});

test("AC-CUS-012 TECH_LEAD (chỉ đọc): không có nút Thêm/Sửa", async ({ page }) => {
  await signIn(page, TECH_LEAD);
  await expect(page.getByRole("heading", { level: 1, name: "Khách hàng" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm khách hàng" })).toHaveCount(0);
  await page.getByText("Anh Ngọc E2E - Grand Hotel").click();
  const dialog = page.getByRole("dialog", { name: "Chi tiết khách hàng" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Lưu" })).toHaveCount(0);
});

test("AC-CUS-012 Khoa (TECHNICIAN) mở /customers trực tiếp → 403", async ({ page }) => {
  await signIn(page, TECHNICIAN);
  await expect(page.getByText("Bạn không có quyền truy cập trang này.")).toBeVisible();
});

test("AC-CUS-013 không cuộn ngang ở 360px (danh sách, form thêm)", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const noHorizontalScroll = async () => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  };

  await signIn(page, MANAGER);
  await expect(page.getByRole("button", { name: "Thêm khách hàng" })).toBeVisible();
  await noHorizontalScroll(); // danh sách

  await page.getByRole("button", { name: "Thêm khách hàng" }).click();
  const form = page.getByRole("dialog", { name: "Thêm khách hàng" });
  await expect(form).toBeVisible();
  await form.getByLabel("Tên khách hàng").fill(`QA360 ${info.project.name}`);
  await form.getByLabel("Số điện thoại").fill("0987000111");
  await noHorizontalScroll(); // form thêm khách hàng
});

test("AC-CUS-037 AC-CUS-038 AC-CUS-039 nút Xuất Excel: desktop tải CSV theo bộ lọc, điện thoại ẩn", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByText("E2E-KH-001")).toBeVisible();
  const exportLink = page.getByRole("link", { name: "Xuất Excel" });

  if (info.project.name === "mobile") {
    await expect(exportLink).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    return;
  }

  await expect(exportLink).toBeVisible();
  expect((await exportLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(exportLink).toHaveAttribute("href", /\/api\/v1\/customers\/export$/);

  // Giống kpi.spec.ts: không dựa vào Download API của trình duyệt — gọi lại đúng href bằng
  // page.request (chung cookie phiên) để kiểm tên file + nội dung.
  const href = await exportLink.getAttribute("href");
  if (href === null) throw new Error("export link missing href");
  await exportLink.click();
  await expect(page.getByRole("heading", { level: 1, name: "Khách hàng" })).toBeVisible();
  const response = await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"] ?? "").toMatch(
    /filename="khach-hang-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  const body = await response.body();
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(body.subarray(3).toString("utf-8")).toMatch(/^Mã KH,Loại,Tên khách hàng/);
  expect(body.toString("utf-8")).toContain("E2E-KH-001");

  await page.getByLabel("Tìm kiếm").fill("Sáng Tạo");
  await page.getByLabel("Loại khách hàng").selectOption("COMPANY");
  await expect(exportLink).toHaveAttribute(
    "href",
    /\/api\/v1\/customers\/export\?q=S%C3%A1ng\+T%E1%BA%A1o&type=COMPANY$/,
  );
});
