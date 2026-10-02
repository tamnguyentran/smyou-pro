import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// Hai test trong file này đều tạo + gửi một đơn qua giao diện Kinh doanh. Chạy song song (mặc
// định `fullyParallel`) thì backend chậm đi và `DraftOrderForm` lộ một race có sẵn: một
// `GET /orders/{id}` bay song song trả về bản chụp cũ hơn và ghi đè cache sau khi lệnh thêm dòng
// hàng đã tăng `version` → "Lưu nháp" bị 409 STALE_VERSION oan. Lỗi nằm ở M3-02b/M3-04b, không
// phải ở điều phối — xem backlog M3-07. Tạm cho file này chạy tuần tự (vẫn độc lập, không "serial":
// test sau không bị skip khi test trước fail).
test.describe.configure({ mode: "default" });

// Accounts/catalog created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const SALE = "hoa.e2e@smyou.vn";
const TECH_LEAD = "tuan.lead@smyou.vn";
// Kỹ thuật viên đang hoạt động được seed (tên bị trùng giữa các tài khoản, nên nhắm theo mã).
const TECHNICIAN_CODE = "E2E02";
// KTV duy nhất không bị buộc đổi mật khẩu → đăng nhập được để kiểm quyền xem (AC-DSP-035).
const TECHNICIAN = "khoa.shell@smyou.vn";
const TECHNICIAN_SHELL_CODE = "E2E08";

async function signIn(page: Page, email: string, path: string) {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

const isMobile = (info: TestInfo) => info.project.name === "mobile";

async function evidence(
  page: Page,
  info: TestInfo,
  file: string,
  { checkOverflow = false }: { checkOverflow?: boolean } = {},
) {
  await page.evaluate(() => document.fonts.ready);
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

function localInput(offsetDays: number, hhmm = "09:00") {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hhmm}`;
}

/** Sale gửi một đơn "Khẩn" để đơn đó nằm trong hàng đợi điều phối; trả về mã đơn. */
async function submitUrgentOrder(page: Page): Promise<string> {
  await signIn(page, SALE, "/orders/new");
  await page.getByLabel("Tìm khách hàng").fill("Sáng Tạo Mới");
  await page.getByRole("option", { name: /Cty Sáng Tạo Mới E2E/ }).click();
  await page.getByLabel("Địa chỉ thi công").fill("12 Lê Lợi, Q1, TP.HCM");
  await page.getByLabel("Mô tả công việc").fill("Lắp 4 camera tầng 1");
  await page
    .getByRole("radiogroup", { name: "Độ ưu tiên" })
    .getByRole("radio", { name: "Khẩn" })
    .click();
  await page.getByLabel("Ngày hẹn").fill(localInput(7).slice(0, 10));
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const sheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await sheet.getByRole("tab", { name: "Dịch vụ" }).click();
  await sheet.getByLabel("Tìm dịch vụ").fill("camera");
  await sheet
    .getByRole("button", { name: /camera/i })
    .first()
    .click();
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  const code = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";

  await page.getByRole("button", { name: "Gửi đơn" }).click();
  await page
    .getByRole("dialog", { name: "Gửi đơn?" })
    .getByRole("button", { name: "Gửi đơn" })
    .click();
  await expect(page.getByText(`Đã gửi đơn ${code}.`)).toBeVisible();
  return code;
}

test("AC-DSP-015 AC-DSP-016 AC-DSP-019 AC-DSP-022 AC-DSP-026 AC-DSP-027 @a11y @screenshot hàng đợi điều phối, tạo đầu việc giao KTV", async ({
  page,
}, info) => {
  const code = await submitUrgentOrder(page);

  // Đổi người dùng giữa test: xoá cookie phiên trước, nếu không SignedOutOnly sẽ bỏ qua form đăng nhập.
  await page.context().clearCookies();
  await signIn(page, TECH_LEAD, "/dispatch/queue");

  // AC-DSP-015 / AC-DSP-016
  await expect(page.getByRole("heading", { name: "Đơn chờ điều phối", level: 1 })).toBeVisible();
  const row = page.getByRole("button", { name: new RegExp(code) });
  await expect(row.first()).toBeVisible();
  if (isMobile(info)) {
    await expect(page.getByRole("table")).toHaveCount(0);
  } else {
    await expect(page.getByRole("columnheader", { name: "Ưu tiên" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Ngày hẹn" })).toBeVisible();
  }
  await evidence(page, info, "dispatch-queue.png", { checkOverflow: true });

  // AC-DSP-019
  await row.first().click();
  const panel = page.getByRole("dialog", { name: `Tạo đầu việc — ${code}` });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Cty Sáng Tạo Mới E2E")).toBeVisible();
  await expect(panel.getByText("Lắp 4 camera tầng 1")).toBeVisible();
  await expect(panel.getByLabel("Mức ưu tiên")).toHaveValue("URGENT");
  await expect(panel.getByLabel("Tiêu đề đầu việc")).toBeFocused();

  // AC-DSP-026: nút chính dính đáy trên mobile, chừa safe-area; desktop là modal giữa màn hình.
  const actionsClass = await panel.getByTestId("task-create-actions").getAttribute("class");
  expect(actionsClass).toMatch(/sticky bottom-0/);
  expect(actionsClass).toMatch(/safe-area-inset-bottom/);

  // AC-DSP-022
  await panel.getByLabel("Tiêu đề đầu việc").fill("Lắp đặt 4 camera tầng 1");
  await panel.getByLabel("Số giờ ước tính").fill("4");
  await panel.getByLabel("Hạn hoàn thành").fill(localInput(2));
  await panel.getByRole("checkbox", { name: new RegExp(TECHNICIAN_CODE) }).check();
  await expect(panel.getByText("Đã chọn 1 kỹ thuật viên")).toBeVisible();
  await evidence(page, info, "dispatch-task-create.png");

  await panel.getByRole("button", { name: "Tạo đầu việc" }).click();
  await expect(
    page.getByText(`Đã tạo đầu việc ${code}-T1 và giao cho 1 kỹ thuật viên.`),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Đơn đã sang IN_PROGRESS nên rời hàng đợi (hàng đợi chỉ hiện PENDING_DISPATCH).
  await expect(page.getByRole("button", { name: new RegExp(code) })).toHaveCount(0);
});

/** Mở trang chi tiết của đơn `code` từ danh sách đơn (hàng bấm được — M3-05). */
async function openOrderDetail(page: Page, code: string) {
  await page.getByLabel("Tìm kiếm").fill(code);
  await expect(page.getByText(code)).toBeVisible();
  await page.getByText(code).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
}

test("AC-DSP-028 AC-DSP-032 AC-DSP-033 AC-DSP-035 AC-DSP-036 AC-DSP-037 @a11y @screenshot tab Đầu việc trên chi tiết đơn", async ({
  page,
}, info) => {
  const code = await submitUrgentOrder(page);

  await page.context().clearCookies();
  await signIn(page, TECH_LEAD, "/orders");
  await openOrderDetail(page, code);

  // AC-DSP-028: 4 tab đúng thứ tự, "Đầu việc" trước "Lịch sử".
  await expect(page.getByRole("tab")).toHaveText(["Thông tin", "Dòng hàng", "Đầu việc", "Lịch sử"]);
  await expect(page.getByText("Chờ điều phối")).toBeVisible();
  await page.getByRole("tab", { name: "Đầu việc" }).click();
  await expect(page.getByText("Chưa có đầu việc nào.")).toBeVisible();

  // AC-DSP-032: tạo đầu việc ngay trong tab, dùng lại panel của M4-01b.
  await page.getByRole("button", { name: "Tạo đầu việc" }).click();
  const panel = page.getByRole("dialog", { name: `Tạo đầu việc — ${code}` });
  await panel.getByLabel("Tiêu đề đầu việc").fill("Nghiệm thu với khách");
  await panel.getByLabel("Số giờ ước tính").fill("1,5");
  await panel.getByLabel("Hạn hoàn thành").fill(localInput(2));
  await panel.getByRole("checkbox", { name: new RegExp(TECHNICIAN_SHELL_CODE) }).check();
  await panel.getByRole("button", { name: "Tạo đầu việc" }).click();
  await expect(
    page.getByText(`Đã tạo đầu việc ${code}-T1 và giao cho 1 kỹ thuật viên.`),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Khoanh vùng danh sách: mã đầu việc cũng xuất hiện trong toast vừa hiện.
  const taskList = page.getByTestId("order-tasks");
  await expect(taskList.getByText(`${code}-T1`)).toBeVisible();

  // AC-DSP-033: task đầu tiên đưa đơn sang IN_PROGRESS → header + hành động đổi theo.
  await expect(page.getByText("Đang thực hiện").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Thu hồi" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Huỷ đơn" })).toHaveCount(0);

  // AC-DSP-036: thẻ trên mobile, bảng trên desktop.
  if (isMobile(info)) {
    await expect(page.getByRole("table")).toHaveCount(0);
  } else {
    await expect(page.getByRole("columnheader", { name: "Hạn hoàn thành" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Người được giao" })).toBeVisible();
  }
  // AC-DSP-036: vùng chạm ≥44px cho nút tạo và tab (mẫu `orders.spec.ts`).
  const createBox = await page.getByRole("button", { name: "Tạo đầu việc" }).boundingBox();
  expect(createBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  const tabBox = await page.getByRole("tab", { name: "Đầu việc" }).boundingBox();
  expect(tabBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  // AC-DSP-037 + ảnh 390px/1440px; checkOverflow chứng minh phần "không cuộn ngang" của AC-DSP-036.
  await evidence(page, info, "order-tasks-tab.png", { checkOverflow: true });

  // AC-DSP-035: KTV được giao xem được tab nhưng không có nút tạo đầu việc.
  await page.context().clearCookies();
  await signIn(page, TECHNICIAN, "/orders");
  await openOrderDetail(page, code);
  await page.getByRole("tab", { name: "Đầu việc" }).click();
  await expect(page.getByTestId("order-tasks").getByText(`${code}-T1`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo đầu việc" })).toHaveCount(0);
});
