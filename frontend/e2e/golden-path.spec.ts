import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

// M6-04 golden path (AC-SYS-096/097): tạo đơn → điều phối → từ chối/giao lại → hoàn thành →
// khách xác nhận → hoàn tất → Chỉnh sửa → mở lại → hoàn tất lần 2. Mỗi project (mobile/desktop)
// tạo đơn riêng (server sinh mã, không đụng nhau) — xem backend/scripts/seed_e2e.py cho các tài
// khoản/khách hàng/dịch vụ dùng ở đây (đã có sẵn, không seed thêm đơn/task cho test này).
const PASSWORD = "E2e@SmYou2026";
const SALE = "hoa.e2e@smyou.vn";
const TECH_LEAD = "tuan.lead@smyou.vn";
const MANAGER = "an.e2e@smyou.vn";
const KHOA = { email: "khoa.shell@smyou.vn", code: "E2E08", name: "Trần Minh Khoa" };
const MINH = { email: "minh.ktv2@smyou.vn", code: "E2E10", name: "Nguyễn Thành Minh" };
const DUC = { email: "duc.ktv3@smyou.vn", code: "E2E11", name: "Đỗ Văn Đức" };

// A real (decodable) 4×4 JPEG — createImageBitmap() (used by compressImage) needs actual valid
// image data, not just magic bytes (same fixture as products.spec.ts AC-CAT-016).
const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABAAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z";

async function signIn(page: Page, email: string, path: string) {
  await page.context().clearCookies();
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function evidence(page: Page, info: TestInfo, file: string) {
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
}

async function openOrderDetail(page: Page, code: string) {
  await page.getByLabel("Tìm kiếm").fill(code);
  await expect(page.getByText(code)).toBeVisible();
  await page.getByText(code).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
}

async function uploadConfirmation(page: Page) {
  const jpeg = Buffer.from(JPEG_BASE64, "base64");
  await page.getByRole("tab", { name: "Tệp đính kèm" }).click();
  await page
    .getByLabel("Tải ảnh phiếu xác nhận", { exact: false })
    .setInputFiles({ name: "confirm.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await expect(page.getByText("Đã tải ảnh phiếu xác nhận.")).toBeVisible({ timeout: 15_000 });
}

async function completeOrder(page: Page, code: string) {
  await page.getByRole("button", { name: "Hoàn tất đơn" }).click();
  const dialog = page.getByRole("dialog", { name: `Hoàn tất đơn ${code}?` });
  await dialog.getByLabel("Tên người ký").fill("Anh Ngọc");
  await dialog.getByRole("button", { name: "Xác nhận hoàn tất" }).click();
  await expect(page.getByText(`Đã hoàn tất đơn ${code}.`)).toBeVisible();
}

/** Nhận → bắt đầu → báo hoàn thành 1 đầu việc từ "Việc của tôi" của 1 KTV. */
async function doTaskWork(page: Page, technicianEmail: string, taskCode: string) {
  await signIn(page, technicianEmail, "/my-tasks");
  const tabs = page.getByRole("tablist", { name: "Việc của tôi" });

  await tabs.getByRole("tab", { name: /Chờ nhận/ }).click();
  const pendingRow = page.locator(`li:has-text("${taskCode}"), tr:has-text("${taskCode}")`).first();
  await expect(pendingRow).toBeVisible();
  await pendingRow.getByRole("button", { name: "Tiếp nhận" }).click();
  await expect(page.getByText("Đã tiếp nhận đầu việc.")).toBeVisible();

  await tabs.getByRole("tab", { name: /Đang làm/ }).click();
  const acceptedRow = page
    .locator(`li:has-text("${taskCode}"), tr:has-text("${taskCode}")`)
    .first();
  await acceptedRow.getByRole("button", { name: "Bắt đầu" }).click();
  await expect(page.getByText("Đã bắt đầu đầu việc.")).toBeVisible();

  const startedRow = page.locator(`li:has-text("${taskCode}"), tr:has-text("${taskCode}")`).first();
  await startedRow.getByRole("button", { name: "Báo hoàn thành" }).click();
  const confirmDialog = page.getByRole("dialog", { name: `Báo hoàn thành đầu việc ${taskCode}?` });
  await confirmDialog.getByRole("button", { name: "Xác nhận hoàn thành" }).click();
  await expect(page.getByText("Đã báo hoàn thành đầu việc.")).toBeVisible();
}

test("AC-SYS-096 AC-SYS-097 @screenshot golden path: tạo đơn → điều phối → từ chối/giao lại → hoàn thành → khách xác nhận → hoàn tất → Chỉnh sửa → mở lại → hoàn tất lần 2", async ({
  page,
}, info) => {
  // Nhiều lượt đăng nhập (băm argon2, M3-08) + nhiều bước UI/axe tuần tự trong 1 test — timeout
  // mặc định 30s không đủ khi backend dev bị bão hoà dưới tải CI (phát hiện: 3 lần CI liên tiếp
  // timeout ở 3 điểm khác nhau của cùng test này khi tổng số test e2e tăng lên ở M8-01a).
  test.setTimeout(120_000);
  // --- AC-SYS-096: Hoa tạo đơn, gửi đơn -------------------------------------------------------
  await signIn(page, SALE, "/orders/new");
  await page.getByLabel("Tìm khách hàng").fill("Anh Ngọc E2E");
  await page.getByRole("option", { name: /Anh Ngọc E2E - Grand Hotel/ }).click();
  await page.getByLabel("Địa chỉ thi công").fill("186 Dương Công Khi, Xã Hóc Môn");

  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  const lineSheet = page.getByRole("dialog", { name: "Thêm dòng hàng" });
  await lineSheet.getByRole("tab", { name: "Dịch vụ" }).click();
  await lineSheet.getByLabel("Tìm dịch vụ").fill("Lắp đặt camera E2E");
  await lineSheet
    .getByRole("button", { name: /Lắp đặt camera E2E/ })
    .first()
    .click();
  await expect(page.getByText("Lắp đặt camera E2E")).toBeVisible();

  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/^Đã lưu nháp DH\d{4}-\d{4}\.$/)).toBeVisible();
  const code = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";

  await page.getByRole("button", { name: "Gửi đơn" }).click();
  await page
    .getByRole("dialog", { name: "Gửi đơn?" })
    .getByRole("button", { name: "Gửi đơn" })
    .click();
  await expect(page.getByText(`Đã gửi đơn ${code}.`)).toBeVisible();
  await evidence(page, info, "golden-order-submitted.png");

  // --- Tuấn tạo Task A (giao Khoa) và Task B (giao Minh) --------------------------------------
  await signIn(page, TECH_LEAD, "/orders");
  await openOrderDetail(page, code);
  await page.getByRole("tab", { name: "Đầu việc" }).click();

  await page.getByRole("button", { name: "Tạo đầu việc" }).click();
  let panel = page.getByRole("dialog", { name: `Tạo đầu việc — ${code}` });
  await panel.getByLabel("Tiêu đề đầu việc").fill("Lắp camera khu vực lễ tân");
  await panel.getByLabel("Số giờ ước tính").fill("2");
  await panel.getByLabel("Hạn hoàn thành").fill(
    (() => {
      const d = new Date(Date.now() + 2 * 86_400_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
    })(),
  );
  await panel.getByRole("checkbox", { name: new RegExp(KHOA.code) }).check();
  await panel.getByRole("button", { name: "Tạo đầu việc" }).click();
  const taskACode = `${code}-T1`;
  await expect(
    page.getByText(`Đã tạo đầu việc ${taskACode} và giao cho 1 kỹ thuật viên.`),
  ).toBeVisible();

  // Chụp assignment.id của Khoa lúc còn PENDING (trước khi từ chối) — dùng để tra đúng audit-event
  // của lần từ chối này, vì entity_id ở audit-events là assignment.id chứ không phải task.id, và
  // mobile/desktop chạy song song nên không thể lọc chỉ bằng actor+action (sẽ lẫn giữa 2 project).
  const orderIdForTaskA = await orderId(page, code);
  const tasksBeforeReject = await page.request.get(`api/v1/orders/${orderIdForTaskA}/tasks`);
  const { items: taskItemsBeforeReject } = (await tasksBeforeReject.json()) as {
    items: { id: string; code: string }[];
  };
  const taskAIdForReject = taskItemsBeforeReject.find((t) => t.code === taskACode)?.id;
  if (!taskAIdForReject) throw new Error(`task ${taskACode} not found`);
  const taskABeforeRejectRes = await page.request.get(
    `api/v1/orders/${orderIdForTaskA}/tasks/${taskAIdForReject}`,
  );
  const taskABeforeReject = (await taskABeforeRejectRes.json()) as {
    assignees: { id: string; full_name: string; status: string }[];
  };
  const khoaAssignmentId = taskABeforeReject.assignees.find((a) => a.full_name === KHOA.name)?.id;
  if (!khoaAssignmentId) throw new Error("không tìm thấy assignment PENDING của Khoa ở Task A");

  await page.getByRole("button", { name: "Tạo đầu việc" }).click();
  panel = page.getByRole("dialog", { name: `Tạo đầu việc — ${code}` });
  await panel.getByLabel("Tiêu đề đầu việc").fill("Lắp camera bãi đỗ xe");
  await panel.getByLabel("Số giờ ước tính").fill("2");
  await panel.getByLabel("Hạn hoàn thành").fill(
    (() => {
      const d = new Date(Date.now() + 2 * 86_400_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
    })(),
  );
  await panel.getByRole("checkbox", { name: new RegExp(MINH.code) }).check();
  await panel.getByRole("button", { name: "Tạo đầu việc" }).click();
  const taskBCode = `${code}-T2`;
  await expect(
    page.getByText(`Đã tạo đầu việc ${taskBCode} và giao cho 1 kỹ thuật viên.`),
  ).toBeVisible();

  // --- Khoa từ chối Task A (SICK) ---------------------------------------------------------------
  await signIn(page, KHOA.email, "/my-tasks");
  await page
    .getByRole("tablist", { name: "Việc của tôi" })
    .getByRole("tab", { name: /Chờ nhận/ })
    .click();
  const taskARow = page.locator(`li:has-text("${taskACode}"), tr:has-text("${taskACode}")`).first();
  await taskARow.getByRole("button", { name: "Từ chối" }).click();
  const rejectDialog = page.getByRole("dialog", { name: `Từ chối đầu việc ${taskACode}?` });
  await rejectDialog.getByLabel("Lý do từ chối").selectOption({ label: "Ốm đau / nghỉ phép" });
  await rejectDialog.getByLabel("Lý do chi tiết").fill("Đang nghỉ ốm, không đi được");
  await rejectDialog.getByRole("button", { name: "Xác nhận từ chối" }).click();
  await expect(page.getByText("Đã từ chối đầu việc.")).toBeVisible();

  // --- Tuấn thêm Đức vào Task A -------------------------------------------------------------------
  await signIn(page, TECH_LEAD, "/orders");
  await openOrderDetail(page, code);
  await page.getByRole("tab", { name: "Đầu việc" }).click();
  const taskList = page.getByTestId("order-tasks");
  await taskList.getByText(taskACode, { exact: true }).click();
  const editPanel = page.getByRole("dialog", { name: `Sửa đầu việc — ${taskACode}` });
  await editPanel.getByRole("button", { name: "+ Thêm người" }).click();
  const candidates = editPanel.getByTestId("assignee-candidates");
  await candidates.getByText(new RegExp(DUC.name)).click();
  await expect(page.getByText(`Đã thêm ${DUC.name} vào đầu việc.`)).toBeVisible();
  await editPanel.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await evidence(page, info, "golden-dispatch-added-duc.png");

  // --- Đức & Minh: nhận → bắt đầu → hoàn thành ----------------------------------------------------
  await doTaskWork(page, DUC.email, taskACode);
  await evidence(page, info, "golden-mytasks-duc-accepted.png");
  await doTaskWork(page, MINH.email, taskBCode);

  // --- Đức tải ảnh phiếu xác nhận (đơn đã AWAITING_CONFIRMATION) ----------------------------------
  await signIn(page, DUC.email, "/orders");
  await openOrderDetail(page, code);
  await uploadConfirmation(page);

  // --- Tuấn hoàn tất đơn ---------------------------------------------------------------------------
  await signIn(page, TECH_LEAD, "/orders");
  await openOrderDetail(page, code);
  await completeOrder(page, code);
  await expect(page.getByText("Hoàn tất", { exact: true })).toBeVisible();
  await evidence(page, info, "golden-order-completed-1.png");

  // --- AC-SYS-096 "Then": xác nhận trạng thái assignment cuối cùng của Task A/B qua API ------------
  const orderIdAfterFirstComplete = await orderId(page, code);
  const tasksAfterFirstComplete = await page.request.get(
    `api/v1/orders/${orderIdAfterFirstComplete}/tasks`,
  );
  const { items: taskItemsAfterFirstComplete } = (await tasksAfterFirstComplete.json()) as {
    items: { id: string; code: string }[];
  };
  const taskAAfterFirstComplete = taskItemsAfterFirstComplete.find((t) => t.code === taskACode);
  const taskBAfterFirstComplete = taskItemsAfterFirstComplete.find((t) => t.code === taskBCode);
  if (!taskAAfterFirstComplete) throw new Error(`task ${taskACode} not found`);
  if (!taskBAfterFirstComplete) throw new Error(`task ${taskBCode} not found`);

  // TaskDetail.assignees chỉ chứa phân công "đang active" (không gồm REJECTED/REMOVED — xem
  // dispatch/service.py `_load_assignees`/`_INACTIVE_ASSIGNMENT_STATUSES`), nên chỉ Đức/Minh (DONE)
  // xuất hiện ở đây; việc Khoa bị REJECTED xác nhận riêng qua audit-events bên dưới.
  const taskADetailRes1 = await page.request.get(
    `api/v1/orders/${orderIdAfterFirstComplete}/tasks/${taskAAfterFirstComplete.id}`,
  );
  const taskADetail1 = (await taskADetailRes1.json()) as {
    assignees: { full_name: string; status: string }[];
  };
  expect(taskADetail1.assignees.find((a) => a.full_name === KHOA.name)).toBeUndefined();
  expect(taskADetail1.assignees.find((a) => a.full_name === DUC.name)?.status).toBe("DONE");

  const taskBDetailRes1 = await page.request.get(
    `api/v1/orders/${orderIdAfterFirstComplete}/tasks/${taskBAfterFirstComplete.id}`,
  );
  const taskBDetail1 = (await taskBDetailRes1.json()) as {
    assignees: { full_name: string; status: string }[];
  };
  expect(taskBDetail1.assignees.find((a) => a.full_name === MINH.name)?.status).toBe("DONE");

  await signIn(page, MANAGER, "/");
  const assignmentAuditRes1 = await page.request.get("api/v1/audit-events", {
    params: { entity_type: "ASSIGNMENT", limit: "100" },
  });
  const { items: assignmentAuditItems1 } = (await assignmentAuditRes1.json()) as {
    items: {
      entity_id: string;
      action: string;
      to_status: string | null;
      actor: { code: string } | null;
    }[];
  };
  const khoaRejectEvents = assignmentAuditItems1.filter(
    (e) => e.entity_id === khoaAssignmentId && e.action === "reject",
  );
  expect(khoaRejectEvents).toHaveLength(1);
  expect(khoaRejectEvents[0]?.to_status).toBe("REJECTED");
  expect(khoaRejectEvents[0]?.actor?.code).toBe(KHOA.code);

  // --- AC-SYS-097: Tuấn chuyển Chỉnh sửa, mở lại Task A ---------------------------------------------
  await signIn(page, TECH_LEAD, "/orders");
  await openOrderDetail(page, code);
  await page.getByRole("button", { name: "Chuyển Chỉnh sửa" }).click();
  const reviseDialog = page.getByRole("dialog", { name: `Chuyển đơn ${code} sang Chỉnh sửa?` });
  await reviseDialog.getByLabel("Lý do").fill("Khách phản hồi lắp camera sai góc, cần chỉnh lại");
  await reviseDialog.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText(`Đã chuyển đơn ${code} sang Chỉnh sửa.`)).toBeVisible();

  await page.getByRole("tab", { name: "Đầu việc" }).click();
  await taskList.getByText(taskACode, { exact: true }).click();
  const editPanel2 = page.getByRole("dialog", { name: `Sửa đầu việc — ${taskACode}` });
  await editPanel2.getByRole("button", { name: "Mở lại" }).click();
  const reopenPanel = page.getByRole("dialog", { name: `Mở lại đầu việc ${taskACode}?` });
  await reopenPanel.getByLabel("Lý do").fill("Lắp sai góc, cần làm lại");
  await reopenPanel.getByLabel("Mức độ lỗi").selectOption("MAJOR");
  await reopenPanel.getByRole("button", { name: "Xác nhận mở lại" }).click();
  await expect(page.getByText(`Đã mở lại đầu việc ${taskACode}.`)).toBeVisible();

  // --- Đức nhận lại → bắt đầu → hoàn thành lần 2, tải ảnh mới -----------------------------------
  await doTaskWork(page, DUC.email, taskACode);
  await signIn(page, DUC.email, "/orders");
  await openOrderDetail(page, code);
  await uploadConfirmation(page);

  // --- Tuấn hoàn tất đơn lần 2 -----------------------------------------------------------------
  await signIn(page, TECH_LEAD, "/orders");
  await openOrderDetail(page, code);
  await completeOrder(page, code);
  await expect(page.getByText("Hoàn tất", { exact: true })).toBeVisible();
  await evidence(page, info, "golden-order-completed-2.png");

  // --- Xác nhận trực tiếp qua API (không qua UI) ------------------------------------------------
  const tasksRes = await page.request.get(`api/v1/orders/${await orderId(page, code)}/tasks`);
  const { items: taskItems } = (await tasksRes.json()) as {
    items: { id: string; code: string }[];
  };
  const taskA = taskItems.find((t) => t.code === taskACode);
  if (!taskA) throw new Error(`task ${taskACode} not found`);
  const orderIdValue = await orderId(page, code);

  const taskDetailRes = await page.request.get(`api/v1/orders/${orderIdValue}/tasks/${taskA.id}`);
  const taskDetail = (await taskDetailRes.json()) as { cycle: number; reopen_count: number };
  expect(taskDetail.cycle).toBe(2);
  expect(taskDetail.reopen_count).toBe(1);

  await signIn(page, MANAGER, "/");
  const auditRes = await page.request.get("api/v1/audit-events", {
    params: { entity_type: "TASK", limit: "100" },
  });
  const { items: auditItems } = (await auditRes.json()) as {
    items: {
      entity_id: string;
      action: string;
      actor: { code: string; full_name: string } | null;
    }[];
  };
  const reopenEvents = auditItems.filter((e) => e.entity_id === taskA.id && e.action === "reopen");
  expect(reopenEvents).toHaveLength(1);
  expect(reopenEvents[0]?.actor?.code).toBe("E2E07"); // tuan.lead@smyou.vn
});

async function orderId(page: Page, code: string): Promise<string> {
  const listRes = await page.request.get("api/v1/orders", { params: { q: code } });
  const { items } = (await listRes.json()) as { items: { id: string; code: string }[] };
  const order = items.find((o) => o.code === code);
  if (!order) throw new Error(`order ${code} not found`);
  return order.id;
}
