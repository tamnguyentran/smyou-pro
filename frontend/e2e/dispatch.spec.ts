import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

// AC-ORD-124 (M3-07): hai test tạo đơn trong file này phải chạy song song được (`fullyParallel`).
// Chúng từng phải chạy tuần tự vì race ghi đè cache `GET /orders/{id}` làm "Lưu nháp" nhận 409
// STALE_VERSION oan khi backend chậm; M3-07 sửa gốc nên không được ép tuần tự lại ở đây.
test("AC-ORD-124 file này không ép chạy tuần tự", () => {
  const source = readFileSync(resolve(import.meta.dirname, "dispatch.spec.ts"), "utf8");
  // Khớp cả khi có khoảng trắng chen vào; chính dòng này không tự khớp vì nó chứa dấu `\s`.
  expect(source).not.toMatch(/describe\s*\.\s*configure\s*\(/);
});

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
  // M4-01d: hàng nút nằm trong footer của Sheet (ngoài vùng cuộn) thay vì `sticky` trong body.
  const actionsClass = await panel.getByTestId("sheet-footer").getAttribute("class");
  expect(actionsClass).toMatch(/safe-area-inset-bottom/);
  await expect(panel.getByTestId("sheet-footer").getByTestId("task-create-actions")).toBeVisible();

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

test("AC-SYS-089 form Tạo đầu việc ở 390px: footer bấm được khi form lỗi, nhập đủ rồi tạo thành công", async ({
  page,
}) => {
  const code = await submitUrgentOrder(page);
  await page.context().clearCookies();
  await signIn(page, TECH_LEAD, "/dispatch/queue");
  // Ép khung mobile thấp ở mọi project để body phải cuộn.
  await page.setViewportSize({ width: 390, height: 520 });
  await page
    .getByRole("button", { name: new RegExp(code) })
    .first()
    .click();
  const panel = page.getByRole("dialog", { name: `Tạo đầu việc — ${code}` });
  await expect(panel).toBeVisible();

  // Bấm khi form còn trống: lỗi hiện trong body, nút footer vẫn trong khung nhìn.
  const submit = panel.getByTestId("sheet-footer").getByRole("button", { name: "Tạo đầu việc" });
  await expect(submit).toBeInViewport();
  await submit.click();
  const body = panel.getByTestId("sheet-body");
  await expect(body.locator("[aria-invalid=true]").first()).toBeVisible();
  await expect(submit).toBeInViewport();
  await expect(panel.getByRole("heading", { level: 2 })).toBeInViewport();

  // Nhập đủ, bấm lại → tạo thành công như M4-01b.
  await panel.getByLabel("Tiêu đề đầu việc").fill("Lắp đặt 4 camera tầng 1");
  await panel.getByLabel("Số giờ ước tính").fill("4");
  await panel.getByLabel("Hạn hoàn thành").fill(localInput(2));
  await panel.getByRole("checkbox", { name: new RegExp(TECHNICIAN_CODE) }).check();
  await submit.click();
  await expect(
    page.getByText(`Đã tạo đầu việc ${code}-T1 và giao cho 1 kỹ thuật viên.`),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("AC-DSP-041 AC-DSP-044 thẻ hàng đợi có nhãn Ngày hẹn/Người tạo; nút chính footer panel rộng đủ trên mobile", async ({
  page,
}, info) => {
  const code = await submitUrgentOrder(page);
  await page.context().clearCookies();
  await signIn(page, TECH_LEAD, "/dispatch/queue");
  const row = page.getByRole("button", { name: new RegExp(code) }).first();
  await expect(row).toBeVisible();
  if (isMobile(info)) {
    await expect(row.getByText("Ngày hẹn:")).toBeVisible();
    await expect(row.getByText("Người tạo:")).toBeVisible();
  }

  await row.click();
  const panel = page.getByRole("dialog", { name: `Tạo đầu việc — ${code}` });
  await expect(panel).toBeVisible();
  const footer = await panel.getByTestId("sheet-footer").boundingBox();
  const submit = await panel
    .getByTestId("sheet-footer")
    .getByRole("button", { name: "Tạo đầu việc" })
    .boundingBox();
  expect(footer).not.toBeNull();
  expect(submit).not.toBeNull();
  expect(submit?.height ?? 0).toBeGreaterThanOrEqual(44);
  if (isMobile(info)) {
    // Xếp dọc, `w-full`: nút chính lấp gần hết chiều rộng footer (chỉ trừ padding ngang).
    expect((submit?.width ?? 0) / (footer?.width ?? 1)).toBeGreaterThanOrEqual(0.85);
    // Nút chính ("Tạo đầu việc") phải đứng trên nút "Đóng" khi xếp dọc.
    const footerButtons = panel.getByTestId("sheet-footer").getByRole("button");
    await expect(footerButtons.first()).toHaveText("Tạo đầu việc");
    await expect(footerButtons.last()).toHaveText("Đóng");
  } else {
    // `sm:w-auto`: nút trở về bề rộng theo nội dung, rõ ràng hẹp hơn footer.
    expect((submit?.width ?? 0) / (footer?.width ?? 1)).toBeLessThan(0.45);
  }
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

  // AC-DSP-028: tab đúng thứ tự, "Đầu việc" trước "Tệp đính kèm"/"Lịch sử".
  await expect(page.getByRole("tab")).toHaveText([
    "Thông tin",
    "Dòng hàng",
    "Đầu việc",
    "Tệp đính kèm",
    "Lịch sử",
  ]);
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

  // M4-02b AC-DSP-058: bấm vào task mở TaskEditSheet, điền sẵn dữ liệu vừa tạo.
  await taskList.getByText(`${code}-T1`).click();
  const editPanel = page.getByRole("dialog", { name: `Sửa đầu việc — ${code}-T1` });
  await expect(editPanel).toBeVisible();
  await expect(editPanel.getByLabel("Tiêu đề đầu việc")).toHaveValue("Nghiệm thu với khách");
  // Không dùng checkOverflow: thu nhỏ viewport xuống <1024px ở giữa bước này làm AppShell đổi bố
  // cục (sidebar → menu trượt) và cuốn theo state cục bộ (tab đang chọn, sheet đang mở) — AC-DSP-069
  // (vùng chạm/cuộn dọc) đã được kiểm ở lớp component (`taskEditSheet.test.tsx`).
  await evidence(page, info, "task-edit-sheet.png");
  await editPanel.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

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

test("AC-DSP-092 @a11y @screenshot bảng đầu việc: vùng chạm ≥44px (gồm thẻ), không cuộn ngang, axe sạch", async ({
  page,
}, info) => {
  // Có 1 đầu việc thật trên bảng (mẫu AC-DSP-015) để kiểm vùng chạm của thẻ, không chỉ bộ lọc.
  const orderCode = await submitUrgentOrder(page);
  await page.context().clearCookies();
  await signIn(page, TECH_LEAD, "/dispatch/queue");
  await page
    .getByRole("button", { name: new RegExp(orderCode) })
    .first()
    .click();
  const createPanel = page.getByRole("dialog", { name: `Tạo đầu việc — ${orderCode}` });
  await createPanel.getByLabel("Tiêu đề đầu việc").fill("Lắp đặt 4 camera tầng 1");
  await createPanel.getByLabel("Số giờ ước tính").fill("4");
  await createPanel.getByLabel("Hạn hoàn thành").fill(localInput(2));
  await createPanel.getByRole("checkbox", { name: new RegExp(TECHNICIAN_CODE) }).check();
  await createPanel.getByRole("button", { name: "Tạo đầu việc" }).click();
  const taskCode = `${orderCode}-T1`;
  await expect(
    page.getByText(`Đã tạo đầu việc ${taskCode} và giao cho 1 kỹ thuật viên.`),
  ).toBeVisible();

  // Viewport mặc định theo project ("mobile" = 390px, "desktop" = 1440px — xem playwright.config.ts)
  // để test này tự kiểm cả danh sách mobile và Kanban desktop, không chỉ luôn ép 390px.
  await page.goto("./dispatch/board");
  await expect(page.getByRole("heading", { name: "Bảng đầu việc", level: 1 })).toBeVisible();

  const card = page.getByRole("button", { name: new RegExp(taskCode) });
  await expect(card).toBeVisible();
  expect((await card.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const priorityAll = page
    .getByRole("radiogroup", { name: "Ưu tiên" })
    .getByRole("radio", { name: "Tất cả" });
  await expect(priorityAll).toBeVisible();
  expect((await priorityAll.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const technicianSelect = page.getByLabel("Kỹ thuật viên");
  expect((await technicianSelect.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  if (isMobile(info)) {
    const statusAll = page
      .getByRole("radiogroup", { name: "Trạng thái" })
      .getByRole("radio", { name: "Tất cả" });
    expect((await statusAll.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  } else {
    await expect(page.getByTestId("task-board-column-PENDING_ACCEPTANCE")).toContainText(taskCode);
  }

  await evidence(
    page,
    info,
    isMobile(info) ? "dispatch-board-390.png" : "dispatch-board-1440.png",
    {
      checkOverflow: true,
    },
  );
});

test("AC-DSP-106 @a11y @screenshot lịch & tải việc: không cuộn ngang, axe sạch", async ({
  page,
}, info) => {
  await signIn(page, TECH_LEAD, "/dispatch/workload");
  await expect(page.getByRole("heading", { name: "Lịch & tải việc", level: 1 })).toBeVisible();

  await evidence(
    page,
    info,
    isMobile(info) ? "dispatch-workload-390.png" : "dispatch-workload-1440.png",
    { checkOverflow: true },
  );
});

test("AC-DSP-107 vào menu Điều phối kỹ thuật → Lịch & tải việc: trang thật, không còn placeholder", async ({
  page,
}, info) => {
  await signIn(page, TECH_LEAD, "/");
  if (isMobile(info)) await page.getByRole("button", { name: "Mở menu" }).click();
  const nav = page.getByRole("navigation", { name: "Menu chính" });
  await nav.getByRole("button", { name: "Điều phối kỹ thuật" }).click();
  await nav.getByRole("link", { name: "Lịch & tải việc" }).click();

  await expect(page).toHaveURL(/\/dispatch\/workload$/);
  await expect(page.getByRole("heading", { name: "Lịch & tải việc", level: 1 })).toBeVisible();
  await expect(page.getByText("Tính năng đang được phát triển.")).toBeHidden();
});
