import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts/catalog created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";
const OTHER_SALE = "ha.e2e@smyou.vn";
const CUSTOMER_CARE = "lan.cskh@smyou.vn";

async function signIn(page: Page, email: string, path = "/orders/new") {
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

/** M21-06b (AC-UI-107): mở lịch của ô ngày `label`; lịch nằm trọn khung nhìn, không cuộn ngang. */
async function expectPickerFits(page: Page, label: string) {
  const field = page.getByLabel(label, { exact: true }).locator("xpath=..");
  await field.getByRole("button", { name: "Chọn ngày" }).click();
  const picker = field.getByRole("dialog", { name: "Chọn ngày" });
  await expect(picker).toBeVisible();
  const box = await picker.boundingBox();
  if (!box) throw new Error("picker has no box");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
}

const isMobile = (info: TestInfo) => info.project.name === "mobile";

async function evidence(
  page: Page,
  info: TestInfo,
  file: string,
  { checkOverflow = false }: { checkOverflow?: boolean } = {},
) {
  await page.evaluate(() => document.fonts.ready);
  // A tab switch right before this call (AC-ORD-098) still has the just-deselected tab's
  // `transition duration-200` color/background mid-flight — axe can sample that interpolated
  // frame and flag a false color-contrast violation that neither the before nor after state has.
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

test("AC-ORD-024 AC-ORD-025 AC-ORD-026 AC-ORD-032 AC-ORD-034 AC-ORD-039 AC-ORD-166 @a11y @screenshot tạo đơn nháp đầy đủ, lưu, mở lại", async ({
  page,
}, info) => {
  await signIn(page, SALE);
  await expect(page.getByRole("heading", { level: 1, name: "Tạo đơn mới" })).toBeVisible();

  // AC-ORD-166: nút "Lưu nháp" disabled (thiếu khách + dòng hàng) nhưng vẫn giữ vùng chạm ≥44px.
  const saveBtn = page.getByRole("button", { name: "Lưu nháp" });
  await expect(saveBtn).toHaveAttribute("aria-disabled", "true");
  const saveBox = await saveBtn.boundingBox();
  expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Overflow check right away, before any typing: evidence()'s checkOverflow resizes across the
  // 1024px breakpoint, which remounts AppShell's outlet (same caveat as customers.spec.ts /
  // services.spec.ts) — safe only here, before there is any unsaved input for it to wipe.
  await evidence(page, info, "order-new-empty.png", { checkOverflow: true });

  // AC-ORD-025: tìm khách có sẵn
  await page.getByLabel("Tìm khách hàng").fill("Sáng Tạo Mới");
  await page.getByRole("option", { name: /Cty Sáng Tạo Mới E2E/ }).click();
  await expect(page.getByText("0909123456")).toBeVisible();
  await page.getByLabel("Nhóm sản phẩm/dịch vụ").selectOption({ label: "Kỹ thuật chung" });
  await page.getByLabel("Địa chỉ thi công").fill("12 Lê Lợi, Q1, TP.HCM");
  await evidence(page, info, "order-new.png");

  // AC-ORD-026: dòng sản phẩm giá cố định (tạo nháp ngầm ở lần thêm dòng đầu tiên)
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const sheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await sheet.getByLabel("Tìm sản phẩm").fill("dell");
  await sheet.getByRole("button", { name: /Màn hình Dell 22 inch E2E/ }).click();
  await expect(page.getByText("Màn hình Dell 22 inch E2E")).toBeVisible();
  expect(page.url()).toContain("/orders/");

  // Dòng dịch vụ (không khoá giá) có giảm giá — AC-ORD-182: chỉ còn Sản phẩm/Dịch vụ, không còn "Tự do".
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const sheet2 = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await sheet2.getByRole("tab", { name: "Dịch vụ" }).click();
  await sheet2.getByLabel("Tìm dịch vụ").fill("camera");
  await sheet2.getByRole("button", { name: /Lắp đặt camera E2E/ }).click();
  await expect(page.getByText("Lắp đặt camera E2E")).toBeVisible();

  const serviceRow = page.getByTestId(/order-line-/).filter({ hasText: "Lắp đặt camera E2E" });
  await serviceRow.getByLabel("Giảm giá").fill("50000");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  await evidence(page, info, "order-lines.png");

  const url = page.url();
  await page.reload();
  await expect(page.getByText("Màn hình Dell 22 inch E2E")).toBeVisible();
  await expect(page.getByText("Lắp đặt camera E2E")).toBeVisible();
  expect(page.url()).toBe(url);

  // AC-ORD-032: xoá dòng
  await serviceRow.getByRole("button", { name: /Xoá dòng/ }).click();
  await page
    .getByRole("dialog", { name: "Xoá dòng hàng" })
    .getByRole("button", { name: "Xoá" })
    .click();
  await expect(page.getByText("Đã xoá dòng hàng.")).toBeVisible();
  await expect(page.getByText("Lắp đặt camera E2E")).toHaveCount(0);
});

test("AC-ORD-037 Hà (SALE khác) chỉ xem đơn của Hoa; An (MANAGER) sửa được", async ({
  page,
}, info) => {
  await signIn(page, SALE);
  await page.getByLabel("Tìm khách hàng").fill("Sáng Tạo Mới");
  await page.getByRole("option", { name: /Cty Sáng Tạo Mới E2E/ }).click();
  await page.getByLabel("Nhóm sản phẩm/dịch vụ").selectOption({ label: "Kỹ thuật chung" });
  // M10-02: "Lưu nháp" chỉ enable khi có khách hàng + ≥1 dòng hàng.
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const lineSheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await lineSheet.getByLabel("Tìm sản phẩm").fill("dell");
  await lineSheet.getByRole("button", { name: /Màn hình Dell 22 inch E2E/ }).click();
  await expect(page.getByText("Màn hình Dell 22 inch E2E")).toBeVisible();
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  // baseURL already carries the app's own base path (playwright.config.ts) — page.url()'s pathname
  // would double it up if passed straight through as `next`, so re-derive just "/orders/{id}".
  const segments = new URL(page.url()).pathname.split("/");
  const orderId = segments[segments.length - 1];
  const orderPath = `/orders/${orderId ?? ""}`;

  // Switching identity mid-test: clear the httpOnly session cookie first, or /dang-nhap's
  // SignedOutOnly guard finds Hoa's session still valid and redirects straight past the login form
  // (flaky — "Email" never appears) instead of showing it for the next sign-in.
  await page.context().clearCookies();
  await signIn(page, OTHER_SALE, orderPath);
  // AC-ORD-038: reopening a saved order starts with Section 1 collapsed on mobile — expand it before
  // checking the read-only customer field it contains.
  if (isMobile(info)) await page.getByRole("button", { name: "Thông tin đơn" }).click();
  await expect(page.getByText("Cty Sáng Tạo Mới E2E")).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm dòng hàng" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lưu nháp" })).toHaveCount(0);

  await page.context().clearCookies();
  await signIn(page, MANAGER, orderPath);
  await expect(page.getByRole("button", { name: "Thêm dòng hàng" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu nháp" })).toBeVisible();
});

test("AC-ORD-061 AC-ORD-064 AC-ORD-065 AC-ORD-067 AC-ORD-071 AC-ORD-093 AC-ORD-098 AC-ORD-100 AC-ORD-105 AC-UI-024 @a11y @screenshot gửi đơn, xem chi tiết, thu hồi, gửi lại, lịch sử, bố cục", async ({
  page,
}, info) => {
  await signIn(page, SALE);
  await page.getByLabel("Tìm khách hàng").fill("Sáng Tạo Mới");
  await page.getByRole("option", { name: /Cty Sáng Tạo Mới E2E/ }).click();
  await page.getByLabel("Nhóm sản phẩm/dịch vụ").selectOption({ label: "Kỹ thuật chung" });
  await page.getByLabel("Địa chỉ thi công").fill("12 Lê Lợi, Q1, TP.HCM");
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const sheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await sheet.getByLabel("Tìm sản phẩm").fill("dell");
  await sheet.getByRole("button", { name: /Màn hình Dell 22 inch E2E/ }).click();
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  const code = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";

  // AC-ORD-061
  await page.getByRole("button", { name: "Gửi đơn" }).click();
  await page
    .getByRole("dialog", { name: "Gửi đơn?" })
    .getByRole("button", { name: "Gửi đơn" })
    .click();
  await expect(page.getByText(`Đã gửi đơn ${code}.`)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Thông tin", selected: true })).toBeVisible();
  await expect(page.getByText("Chờ điều phối")).toBeVisible();

  // AC-ORD-064
  await expect(page.getByRole("button", { name: "Thu hồi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Huỷ đơn" })).toBeVisible();

  // AC-ORD-071: mobile pill tabs scroll within their own container (no page overflow); desktop
  // keeps the action buttons in the sticky header, not a bottom bar.
  await evidence(page, info, "order-detail.png", { checkOverflow: true });
  const actionsClass = await page.getByTestId("order-detail-actions").getAttribute("class");
  if (isMobile(info)) {
    expect(actionsClass).toMatch(/sticky bottom-16/);
  } else {
    expect(actionsClass).toMatch(/lg:static/);
  }

  // AC-ORD-093/AC-ORD-105: sửa liên hệ ngay trên trang chi tiết (bottom sheet mobile/modal desktop).
  // No `checkOverflow` here: that option resizes the viewport mid-test, and doing so while this
  // Sheet is open isn't needed — AC-ORD-071 already proves the page has no horizontal scroll, and
  // the Sheet's own mobile/desktop shape is captured by this screenshot at the project's own fixed
  // viewport (this spec runs once per project: 390px mobile, 1440px desktop).
  await page.getByRole("button", { name: "Sửa liên hệ" }).click();
  const contactSheet = page.getByRole("dialog", { name: "Sửa liên hệ" });
  await contactSheet.getByLabel("Số điện thoại").fill("0988777666");
  await evidence(page, info, "order-edit-contact.png");
  await contactSheet.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã cập nhật liên hệ.")).toBeVisible();
  await expect(page.getByText("0988777666")).toBeVisible();

  // AC-ORD-098/AC-ORD-100: thêm rồi xoá 1 dòng sau khi gửi (cùng AddLineSheet của DraftOrderForm).
  // Dùng dịch vụ (không phải sản phẩm) — "Hộp mực Canon E2E" (sản phẩm thứ 2 được seed) có
  // `is_active=false` nên không bao giờ hiện trong tìm kiếm (ProductPicker lọc is_active=true).
  await page.getByRole("tab", { name: "Dòng hàng" }).click();
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const addLineSheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await addLineSheet.getByRole("tab", { name: "Dịch vụ" }).click();
  await addLineSheet.getByLabel("Tìm dịch vụ").fill("camera");
  await evidence(page, info, "order-add-line-after-submit.png");
  await addLineSheet.getByRole("button", { name: /Lắp đặt camera E2E/ }).click();
  await expect(page.getByText("Lắp đặt camera E2E")).toBeVisible();
  const newLineRow = page.locator('[data-testid^="order-line-"]', {
    hasText: "Lắp đặt camera E2E",
  });
  await newLineRow.getByRole("button", { name: /Xoá dòng/ }).click();
  await page
    .getByRole("dialog", { name: "Xoá dòng hàng" })
    .getByRole("button", { name: "Xoá" })
    .click();
  await expect(page.getByText("Đã xoá dòng hàng.")).toBeVisible();
  await expect(page.getByText("Lắp đặt camera E2E")).not.toBeVisible();
  await page.getByRole("tab", { name: "Thông tin" }).click();

  // AC-ORD-065: thu hồi → hiện lại DraftOrderForm
  await page.getByRole("button", { name: "Thu hồi" }).click();
  await page
    .getByRole("dialog", { name: "Thu hồi đơn?" })
    .getByRole("button", { name: "Thu hồi" })
    .click();
  await expect(page.getByText(`Đã thu hồi đơn ${code}.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi đơn" })).toBeVisible();

  // Gửi lại để có 3 sự kiện lịch sử (submit → recall → submit), đang PENDING_DISPATCH.
  await page.getByRole("button", { name: "Gửi đơn" }).click();
  await page
    .getByRole("dialog", { name: "Gửi đơn?" })
    .getByRole("button", { name: "Gửi đơn" })
    .click();
  await expect(page.getByText(`Đã gửi đơn ${code}.`)).toBeVisible();

  // AC-ORD-067
  await page.getByRole("tab", { name: "Lịch sử" }).click();
  const events = page.getByRole("list", { name: "Lịch sử đơn" }).getByText(/^(Thu hồi|Gửi đơn)$/);
  await expect(events).toHaveCount(3);
  await expect(events.nth(0)).toHaveText("Gửi đơn");
  await expect(events.nth(1)).toHaveText("Thu hồi");
  await expect(events.nth(2)).toHaveText("Gửi đơn");
});

test("AC-ORD-063 huỷ đơn nháp", async ({ page }) => {
  await signIn(page, SALE);
  await page.getByLabel("Nhóm sản phẩm/dịch vụ").selectOption({ label: "Kỹ thuật chung" });
  await page.getByLabel("Địa chỉ thi công").fill("34 Nguyễn Huệ, Q1, TP.HCM");
  await page.getByLabel("Mô tả công việc").fill("Lắp camera văn phòng");
  // M10-02: "Lưu nháp" chỉ enable khi có khách hàng + ≥1 dòng hàng.
  await page.getByLabel("Tìm khách hàng").fill("Sáng Tạo Mới");
  await page.getByRole("option", { name: /Cty Sáng Tạo Mới E2E/ }).click();
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const lineSheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await lineSheet.getByLabel("Tìm sản phẩm").fill("dell");
  await lineSheet.getByRole("button", { name: /Màn hình Dell 22 inch E2E/ }).click();
  await expect(page.getByText("Màn hình Dell 22 inch E2E")).toBeVisible();
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  const code = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";

  await page.getByRole("button", { name: "Huỷ đơn" }).click();
  const dialog = page.getByRole("dialog", { name: `Huỷ đơn ${code}?` });
  const confirm = dialog.getByRole("button", { name: "Xác nhận huỷ" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox").fill("Khách đổi ý không mua nữa");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText(`Đã huỷ đơn ${code}.`)).toBeVisible();
  await expect(page).toHaveURL(/\/orders$/);
});

test("AC-ORD-069 AC-ORD-110 AC-ORD-113 AC-ORD-114 AC-UI-014 @a11y @screenshot danh sách đơn, lọc trạng thái bằng chip", async ({
  page,
}, info) => {
  await signIn(page, SALE);
  await page.getByLabel("Nhóm sản phẩm/dịch vụ").selectOption({ label: "Kỹ thuật chung" });
  await page.getByLabel("Địa chỉ thi công").fill("56 Lý Tự Trọng, Q1, TP.HCM");
  // M10-02: "Lưu nháp" chỉ enable khi có khách hàng + ≥1 dòng hàng.
  await page.getByLabel("Tìm khách hàng").fill("Sáng Tạo Mới");
  await page.getByRole("option", { name: /Cty Sáng Tạo Mới E2E/ }).click();
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const lineSheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await lineSheet.getByLabel("Tìm sản phẩm").fill("dell");
  await lineSheet.getByRole("button", { name: /Màn hình Dell 22 inch E2E/ }).click();
  await expect(page.getByText("Màn hình Dell 22 inch E2E")).toBeVisible();
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  const code = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";

  await page.goto("./orders");
  await expect(page.getByRole("heading", { level: 1, name: "Danh sách đơn" })).toBeVisible();

  // AC-ORD-110/AC-ORD-113: nhóm chip trạng thái, đủ 9 chip đúng thứ tự, "Tất cả" đang chọn, vùng chạm ≥44px.
  const statusGroup = page.getByRole("radiogroup", { name: "Trạng thái" });
  await expect(statusGroup.getByRole("radio")).toHaveCount(9);
  const chipLabels = await statusGroup.getByRole("radio").allTextContents();
  expect(chipLabels).toEqual([
    "Tất cả",
    "Nháp",
    "Chờ điều phối",
    "Đang thực hiện",
    "Chờ KH xác nhận",
    "Hoàn tất",
    "Chỉnh sửa",
    "Đã huỷ",
    "Quá hạn",
  ]);
  await expect(statusGroup.getByRole("radio", { name: "Tất cả" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const chipBox = await statusGroup.getByRole("radio", { name: "Chờ điều phối" }).boundingBox();
  expect(chipBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  // AC-ORD-114: axe 0 serious/critical + ảnh 390px/1440px; checkOverflow chứng minh phần
  // "chip tự xuống dòng, không cuộn ngang" của AC-ORD-113.
  await evidence(page, info, "order-list.png", { checkOverflow: true });

  await page.getByLabel("Tìm kiếm").fill(code);
  await expect(page.getByText(code)).toBeVisible();
  await page.getByText(code).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
});

test("AC-CSK-010 AC-CSK-012 @a11y @screenshot danh sách đơn: bộ lọc ngày + ô thống kê sao (CSKH)", async ({
  page,
}, info) => {
  await signIn(page, CUSTOMER_CARE, "/orders");
  await expect(page.getByRole("heading", { level: 1, name: "Danh sách đơn" })).toBeVisible();

  // AC-CSK-010: mặc định bộ lọc ngày = đầu tháng hiện tại → hôm nay.
  await expect(page.getByLabel("Từ ngày")).not.toHaveValue("");
  await expect(page.getByLabel("Đến ngày")).not.toHaveValue("");

  // AC-CSK-012: ô thống kê 6 số (5★..1★ + "chưa đánh giá") bấm được để lọc.
  await expect(page.getByRole("button", { name: /^5★/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /chưa đánh giá/i })).toBeVisible();

  await evidence(page, info, "order-list-csat.png", { checkOverflow: true });
});

test("AC-CSK-033 @screenshot thẻ 'Chưa đánh giá' lọc danh sách (CSKH)", async ({ page }, info) => {
  await signIn(page, CUSTOMER_CARE, "/orders");
  const tile = page.getByRole("button", { name: /chưa đánh giá/i });
  await expect(tile).toBeEnabled();

  const filtered = page.waitForResponse(
    (res) => res.url().includes("/api/v1/orders?") && res.url().includes("csat_unrated=true"),
  );
  await tile.click();
  const page1 = (await (await filtered).json()) as { items: { csat_rating: number | null }[] };
  await expect(tile).toHaveAttribute("aria-pressed", "true");

  const shown = Number(await tile.locator("p").nth(1).textContent());
  expect(shown).toBeGreaterThan(0);
  expect(page1.items).toHaveLength(Math.min(shown, 20));
  expect(page1.items.every((item) => item.csat_rating === null)).toBe(true);

  const rows = isMobile(info)
    ? page.locator("main ul > li > button")
    : page.locator("main tbody tr");
  await expect(rows).toHaveCount(Math.min(shown, 20));
  for (const tone of ["bg-completed-bg", "bg-review-bg", "bg-urgent-bg"]) {
    await expect(rows.and(page.locator(`.${tone}`))).toHaveCount(0);
  }

  await evidence(page, info, "order-list-csat-unrated.png", { checkOverflow: true });
});

// M20-03: seed_e2e.py MINE_DEFAULT_ORDERS — E2E-DH-M2003L (Lan tạo), E2E-DH-M2003H (Sale Hà tạo),
// cả hai COMPLETED trong tháng, chưa đánh giá.
test("AC-ORD-243 AC-ORD-246 Sale mở danh sách đơn: mặc định chỉ đơn của mình, bỏ tick thấy đơn của Sale khác", async ({
  page,
}) => {
  const firstList = page.waitForResponse(
    (res) => res.url().includes("/api/v1/orders?") && !res.url().includes("q="),
  );
  await signIn(page, SALE, "/orders");
  const first = await firstList;
  expect(new URL(first.url()).searchParams.get("mine")).toBe("true");
  const body = (await first.json()) as { items: { created_by_name: string }[] };
  expect(body.items.every((item) => item.created_by_name === "Lê Thị Hoa")).toBe(true);

  const mine = page.getByRole("checkbox", { name: "Chỉ đơn của tôi" });
  await expect(mine).toBeChecked();
  await page.getByLabel("Tìm kiếm").fill("E2E-DH-M2003H");
  await expect(page.getByText("Không tìm thấy đơn nào.")).toBeVisible();

  const all = page.waitForResponse(
    (res) =>
      res.url().includes("/api/v1/orders?") &&
      res.url().includes("q=E2E-DH-M2003H") &&
      !res.url().includes("mine="),
  );
  await mine.uncheck();
  await all;
  await expect(page.getByText("E2E-DH-M2003H").first()).toBeVisible();
});

test("AC-ORD-250 @screenshot CSKH: thẻ 'Chưa đánh giá' đếm theo 'Chỉ đơn của tôi'", async ({
  page,
}, info) => {
  await signIn(page, CUSTOMER_CARE, "/orders");
  const mine = page.getByRole("checkbox", { name: "Chỉ đơn của tôi" });
  await expect(mine).toBeChecked();
  const tile = page.getByRole("button", { name: /chưa đánh giá/i });
  const tileCount = async () => Number(await tile.locator("p").nth(1).textContent());
  await expect(tile.locator("p").nth(1)).toHaveText("1");

  const rows = isMobile(info)
    ? page.locator("main ul > li > button")
    : page.locator("main tbody tr");
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("E2E-DH-M2003L");
  // Không checkOverflow ở giữa test: đổi kích thước viewport có thể làm mất bộ lọc thẻ đang chọn.
  await evidence(page, info, "order-list-mine-default-csat.png");

  // Bỏ tick → thẻ + danh sách tính toàn công ty (stack e2e dùng chung: ≥ 2, có cả đơn của Hà).
  const companyWide = page.waitForResponse(
    (res) =>
      res.url().includes("/api/v1/orders?") &&
      res.url().includes("csat_unrated=true") &&
      !res.url().includes("mine="),
  );
  await mine.uncheck();
  const page1 = (await (await companyWide).json()) as { total: number };
  await expect(tile.locator("p").nth(1)).not.toHaveText("1");
  const shown = await tileCount();
  expect(shown).toBeGreaterThanOrEqual(2);
  expect(page1.total).toBe(shown);
  await expect(rows).toHaveCount(Math.min(shown, 20));
});

test("AC-UI-098 AC-UI-107 @screenshot CSKH gõ Từ ngày/Đến ngày kiểu dd/MM/yyyy, API nhận yyyy-MM-dd; lịch vừa màn hình", async ({
  page,
}, info) => {
  await signIn(page, CUSTOMER_CARE, "/orders");
  await expect(page.getByRole("heading", { level: 1, name: "Danh sách đơn" })).toBeVisible();
  const from = page.getByLabel("Từ ngày");
  const to = page.getByLabel("Đến ngày");
  await expect(page.locator('input[type="date"]')).toHaveCount(0);

  await from.fill("");
  await from.pressSequentially("01102026");
  await to.fill("");
  const listed = page.waitForRequest(
    (r) => r.url().includes("/api/v1/orders?") && r.url().includes("to=2026-10-31"),
  );
  await to.pressSequentially("31102026");
  const url = (await listed).url();
  expect(url).toContain("from=2026-10-01");
  await expect(from).toHaveValue("01/10/2026");
  await expect(to).toHaveValue("31/10/2026");

  await expectPickerFits(page, "Từ ngày");
  await evidence(page, info, "order-list-datefield.png", { checkOverflow: true });
});
