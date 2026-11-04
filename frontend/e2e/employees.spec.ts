import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";
const TECH_LEAD = "tuan.lead@smyou.vn";
const SALE = "hoa.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/employees") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

/** `checkOverflow` toggles the 360px resize check: only safe when nothing needs to survive it —
 * crossing the 1024px breakpoint remounts AppShell's outlet (desktop sidebar ↔ mobile header/drawer),
 * which would drop any open Sheet/dialog state even though the viewport is restored afterward. */
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

test("AC-EMP-013 AC-EMP-018 AC-UI-014 @a11y @screenshot danh sách Nhân sự (Manager)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Nhân sự & phân quyền" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm nhân viên" })).toBeVisible();
  // no further interaction after this — safe to also check the 360px breakpoint
  await evidence(page, info, "employees.png", { checkOverflow: true });
});

test("AC-EMP-014 AC-EMP-018 @a11y @screenshot thêm nhân viên và mật khẩu tạm", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const form = page.getByRole("dialog", { name: "Thêm nhân viên" });
  await expect(form).toBeVisible();

  const email = `qa.${info.project.name}.${String(Date.now())}@smyou.vn`;
  await form.getByLabel("Họ và tên").fill("QA Kiểm thử");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Phòng ban").selectOption({ label: "Phát Triển Kinh Tế" });
  await form.getByRole("checkbox", { name: "Nhân viên kinh doanh" }).check();
  await evidence(page, info, "employee-form.png");

  await form.getByRole("button", { name: "Lưu" }).click();
  const passwordDialog = page.getByRole("dialog", { name: "Mật khẩu tạm" });
  await expect(passwordDialog).toBeVisible();
  await expect(
    passwordDialog.getByText("Mật khẩu chỉ hiện một lần. Hãy gửi cho nhân viên qua kênh riêng."),
  ).toBeVisible();
  await evidence(page, info, "temporary-password.png");

  await passwordDialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page.getByText("Đã thêm nhân viên QA Kiểm thử.")).toBeVisible();
});

test("AC-EMP-018 không cuộn ngang ở 360px (danh sách, form thêm, mật khẩu tạm)", async ({
  page,
}, info) => {
  // Chạy toàn bộ ở đúng 360px ngay từ đầu — không cắt ngang mốc 1024px, vì AppShell remount
  // outlet (sidebar ↔ menu trượt) ở mốc đó và làm mất sheet đang mở giữa chừng.
  await page.setViewportSize({ width: 360, height: 780 });
  const noHorizontalScroll = async () => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  };

  await signIn(page, MANAGER);
  await expect(page.getByRole("button", { name: "Thêm nhân viên" })).toBeVisible();
  await noHorizontalScroll(); // danh sách

  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const form = page.getByRole("dialog", { name: "Thêm nhân viên" });
  await expect(form).toBeVisible();
  const email = `qa.360.${info.project.name}.${String(Date.now())}@smyou.vn`;
  await form.getByLabel("Họ và tên").fill("QA 360px");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Phòng ban").selectOption({ label: "Phát Triển Kinh Tế" });
  await form.getByRole("checkbox", { name: "Nhân viên kinh doanh" }).check();
  await noHorizontalScroll(); // form thêm nhân viên

  await form.getByRole("button", { name: "Lưu" }).click();
  const passwordDialog = page.getByRole("dialog", { name: "Mật khẩu tạm" });
  await expect(passwordDialog).toBeVisible();
  await noHorizontalScroll(); // mật khẩu tạm
  await passwordDialog.getByRole("button", { name: "Đóng", exact: true }).click();
});

test("AC-EMP-016 khoá tài khoản, cấp lại mật khẩu, mở khoá (backend thật)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  // Tạo riêng một nhân viên cho test này — không đụng các tài khoản seed dùng chung với spec khác.
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const createForm = page.getByRole("dialog", { name: "Thêm nhân viên" });
  const name = "QA Khoá Mở";
  const email = `qa.lock.${info.project.name}.${String(Date.now())}@smyou.vn`;
  await createForm.getByLabel("Họ và tên").fill(name);
  await createForm.getByLabel("Email").fill(email);
  await createForm.getByLabel("Phòng ban").selectOption({ label: "Phát Triển Kinh Tế" });
  await createForm.getByRole("checkbox", { name: "Nhân viên kỹ thuật" }).check();
  await createForm.getByRole("button", { name: "Lưu" }).click();
  await page
    .getByRole("dialog", { name: "Mật khẩu tạm" })
    .getByRole("button", { name: "Đóng", exact: true })
    .click();
  await expect(page.getByText(`Đã thêm nhân viên ${name}.`)).toBeVisible();

  // Lọc theo email (duy nhất trong lần chạy này) rồi mới bấm vào dòng — tên có thể trùng
  // với nhân viên QA tạo ở các lần chạy e2e trước, và dòng mới có thể nằm ở trang khác.
  // Desktop hiển thị dạng bảng (<tr>, nút chỉ chứa tên); mobile hiển thị dạng danh sách
  // (<li>, nút chứa cả tên lẫn email) — lọc theo dòng chứa email rồi tìm nút theo tên
  // hoạt động cho cả hai bố cục.
  await page.getByLabel("Tìm kiếm").fill(email);
  const row = page.locator("li, tr").filter({ hasText: email });
  await row
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  const editDialog = page.getByRole("dialog", { name: "Sửa nhân viên" });

  await editDialog.getByRole("button", { name: "Khoá tài khoản" }).click();
  const lockConfirm = page.getByRole("dialog", { name: "Khoá tài khoản" });
  await expect(lockConfirm.getByText("Nhân viên sẽ bị đăng xuất khỏi mọi thiết bị.")).toBeVisible();
  await lockConfirm.getByRole("button", { name: "Khoá tài khoản" }).click();
  await expect(editDialog.getByRole("button", { name: "Mở khoá" })).toBeVisible();

  await editDialog.getByRole("button", { name: "Cấp lại mật khẩu" }).click();
  const resetConfirm = page.getByRole("dialog", { name: "Cấp lại mật khẩu" });
  await expect(resetConfirm.getByText("Mật khẩu cũ sẽ không dùng được nữa.")).toBeVisible();
  await resetConfirm.getByRole("button", { name: "Cấp lại mật khẩu" }).click();
  const passwordDialog = page.getByRole("dialog", { name: "Mật khẩu tạm" });
  await expect(passwordDialog).toBeVisible();
  await passwordDialog.getByRole("button", { name: "Đóng", exact: true }).click();

  await editDialog.getByRole("button", { name: "Mở khoá" }).click();
  const unlockConfirm = page.getByRole("dialog", { name: "Mở khoá" });
  await unlockConfirm.getByRole("button", { name: "Mở khoá" }).click();
  await expect(editDialog.getByRole("button", { name: "Khoá tài khoản" })).toBeVisible();
});

test("AC-EMP-017 QLKT chỉ đọc: không có nút quản lý", async ({ page }) => {
  await signIn(page, TECH_LEAD);
  await expect(page.getByRole("heading", { level: 1, name: "Nhân sự & phân quyền" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm nhân viên" })).toHaveCount(0);
});

test("AC-EMP-017 Sale mở /employees trực tiếp → 403", async ({ page }) => {
  await signIn(page, SALE);
  await expect(page.getByText("Bạn không có quyền truy cập trang này.")).toBeVisible();
});

test("AC-EMP-018 vùng chạm ≥ 44px trên danh sách", async ({ page }) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("button", { name: "Thêm nhân viên" })).toBeVisible();
  for (const control of await page.locator("button:visible, a:visible").all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("AC-EMP-063 @screenshot tạo nhân viên chọn phòng ban mới từ danh sách", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const form = page.getByRole("dialog", { name: "Thêm nhân viên" });
  const name = "QA Phòng ban";
  const email = `qa.dept.${info.project.name}.${String(Date.now())}@smyou.vn`;
  await form.getByLabel("Họ và tên").fill(name);
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Phòng ban").selectOption({ label: "Nhân sự/Marketing" });
  await form.getByRole("checkbox", { name: "Nhân viên kinh doanh" }).check();
  await evidence(page, info, "employee-department-form.png");
  await form.getByRole("button", { name: "Lưu" }).click();
  await page
    .getByRole("dialog", { name: "Mật khẩu tạm" })
    .getByRole("button", { name: "Đóng", exact: true })
    .click();
  await expect(page.getByText(`Đã thêm nhân viên ${name}.`)).toBeVisible();

  await page.getByLabel("Tìm kiếm").fill(email);
  const row = page.locator("li, tr").filter({ hasText: email });
  await row.getByRole("button", { name: new RegExp(name) }).click();
  const editDialog = page.getByRole("dialog", { name: "Sửa nhân viên" });
  await expect(editDialog.getByLabel("Phòng ban").locator("option:checked")).toHaveText(
    "Nhân sự/Marketing",
  );
});

test("AC-EMP-071 @screenshot tạo nhân viên đủ hồ sơ cá nhân, mở lại thấy đúng", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const form = page.getByRole("dialog", { name: "Thêm nhân viên" });
  const name = `Kim Yến ${info.project.name} ${String(Date.now())}`;
  await form.getByLabel("Họ và tên").fill(name);
  await form.getByLabel("Ngày sinh").fill("30/07/1985");
  await form.getByLabel("Nơi sinh").fill("An Giang");
  await form.getByLabel("Giới tính").selectOption({ label: "Nữ" });
  await form.getByLabel("SĐT").fill("0932068787");
  await form.getByLabel("Địa chỉ").fill("12 Trần Hưng Đạo, Long Xuyên, An Giang");
  await form.getByLabel("CMND/CCCD").fill("089185000565");
  await form.getByLabel("Ngày cấp").fill("08/10/2018");
  await form.getByLabel("Nơi cấp").fill("Cục Cảnh sát QLHC về TTXH");
  await form.getByLabel("Tình trạng hôn nhân").selectOption({ label: "Đã kết hôn" });
  await form.getByLabel("Phòng ban").selectOption({ label: "Phát Triển Kinh Tế" });
  await form.getByRole("checkbox", { name: "Nhân viên kinh doanh" }).check();
  await evidence(page, info, "employee-profile-form.png");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await form.getByRole("button", { name: "Lưu" }).click();
  await page
    .getByRole("dialog", { name: "Mật khẩu tạm" })
    .getByRole("button", { name: "Đóng", exact: true })
    .click();
  await expect(page.getByText(`Đã thêm nhân viên ${name}.`)).toBeVisible();

  await page.getByLabel("Tìm kiếm").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  const edit = page.getByRole("dialog", { name: "Sửa nhân viên" });
  await expect(edit.getByLabel("Ngày sinh")).toHaveValue("30/07/1985");
  await expect(edit.getByLabel("Nơi sinh")).toHaveValue("An Giang");
  await expect(edit.getByLabel("Giới tính").locator("option:checked")).toHaveText("Nữ");
  await expect(edit.getByLabel("Địa chỉ")).toHaveValue("12 Trần Hưng Đạo, Long Xuyên, An Giang");
  await expect(edit.getByLabel("Email")).toHaveValue("");
  await expect(edit.getByLabel("CMND/CCCD")).toHaveValue("089185000565");
  await expect(edit.getByLabel("Ngày cấp")).toHaveValue("08/10/2018");
  await expect(edit.getByLabel("Nơi cấp")).toHaveValue("Cục Cảnh sát QLHC về TTXH");
  await expect(edit.getByLabel("Tình trạng hôn nhân").locator("option:checked")).toHaveText(
    "Đã kết hôn",
  );
  await evidence(page, info, "employee-profile-edit.png");
});

test("AC-AUTH-074 @screenshot tạo NV có ngày sinh → đăng nhập bằng tên đăng nhập + ngày sinh → bắt đổi mật khẩu", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const form = page.getByRole("dialog", { name: "Thêm nhân viên" });
  await form.getByLabel("Họ và tên").fill("Nguyễn Lê Kim Yến");
  await form.getByLabel("Ngày sinh").fill("30/07/1985");
  await form.getByLabel("Phòng ban").selectOption({ label: "Phát Triển Kinh Tế" });
  await form.getByRole("checkbox", { name: "Nhân viên kinh doanh" }).check();
  await form.getByRole("button", { name: "Lưu" }).click();

  const done = page.getByRole("dialog", { name: "Mật khẩu tạm" });
  await expect(done.getByText("30071985")).toBeVisible();
  // yen.nlk on a fresh database; earlier `make e2e` runs already took it → yen.nlk2, yen.nlk3…
  const shown = await done.getByText(/^Tên đăng nhập: /).textContent();
  const username = (shown ?? "").replace("Tên đăng nhập: ", "");
  expect(username).toMatch(/^yen\.nlk\d*$/);
  await page.screenshot({ path: shot(info, "employee-username-created.png"), fullPage: true });
  await done.getByRole("button", { name: "Đóng", exact: true }).click();

  await page.context().clearCookies(); // signed out
  await page.goto("./dang-nhap");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("30071985");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/smyoutask\/doi-mat-khau$/);
  await page.screenshot({ path: shot(info, "login-username-first-change.png"), fullPage: true });
});

test("AC-EMP-085 AC-EMP-083 @a11y @screenshot khối Cách phân quyền hoạt động (mobile: chọn vai trò, desktop: bảng)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  const toggle = page.getByRole("button", { name: "Cách phân quyền hoạt động" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect((await toggle.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await toggle.click();
  const guide = page.getByRole("region", { name: "Cách phân quyền hoạt động" });
  await expect(guide.getByRole("heading", { name: "Quyền theo vai trò" })).toBeVisible();
  if (info.project.name === "mobile") {
    const role = guide.getByLabel("Vai trò");
    await expect(role).toHaveValue("MANAGER");
    await role.selectOption("TECHNICIAN");
    await expect(
      guide.getByText("Nhận/từ chối/bắt đầu/xong việc được giao — Bản thân"),
    ).toBeVisible();
    await expect(guide.getByText(/^Tạo đơn —/)).toHaveCount(0);
  } else {
    const row = guide.getByRole("row", { name: /^Sửa đơn nháp/ });
    await expect(row.getByRole("cell")).toHaveText(["Tất cả", "Của mình", "Của mình", "—", "—"]);
  }
  // 390→360 crosses no breakpoint, so the open guide survives the overflow check on mobile; on
  // desktop the resize would cross 1024px and remount the page, so it is skipped there
  await evidence(page, info, "employees-permission-guide.png", {
    checkOverflow: info.project.name === "mobile",
  });
});

const ECONOMIC = "d4444444-4444-4444-8444-444444444444";

/** M20-08: a fresh employee with phone + birth date, created through the API (same session cookie). */
async function createKhoa(page: Page, info: TestInfo): Promise<{ name: string; username: string }> {
  const name = `Phạm Văn Khoa ${info.project.name} ${String(Date.now())}`;
  const res = await page.request.post("api/v1/employees", {
    data: {
      full_name: name,
      phone: "0912345678",
      birth_date: "1995-04-20",
      department_id: ECONOMIC,
      roles: ["TECHNICIAN"],
    },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { employee: { username: string } };
  return { name, username: body.employee.username };
}

test("AC-EMP-105 AC-EMP-106 AC-EMP-107 @screenshot cột Tài khoản đăng nhập, SĐT, Ngày sinh; tìm theo tên đăng nhập", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Nhân sự & phân quyền" })).toBeVisible();
  const khoa = await createKhoa(page, info);

  await page.getByLabel("Tìm kiếm").fill(khoa.username);
  if (info.project.name === "mobile") {
    const card = page.getByRole("button", { name: new RegExp(khoa.name) });
    await expect(card).toContainText(`Tài khoản: ${khoa.username}`);
    await expect(card).toContainText("0912345678");
    await expect(card).toContainText("Ngày sinh: 20/04/1995");
    expect((await card.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await evidence(page, info, "employees-login-column.png");
    await card.click();
    await expect(page.getByRole("dialog", { name: "Sửa nhân viên" })).toBeVisible();
    return;
  }

  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText([
    "Mã",
    "Họ tên",
    "Tài khoản đăng nhập",
    "Email",
    "SĐT",
    "Ngày sinh",
    "Vai trò",
    "Trạng thái",
  ]);
  const row = table.getByRole("row").filter({ hasText: khoa.name });
  await expect(row).toHaveCount(1);
  const cells = row.getByRole("cell");
  await expect(cells.nth(1)).toHaveText(khoa.name);
  await expect(cells.nth(2)).toHaveText(khoa.username);
  await expect(cells.nth(3)).toHaveText("—");
  await expect(cells.nth(4)).toHaveText("0912345678");
  await expect(cells.nth(5)).toHaveText("20/04/1995");
  await evidence(page, info, "employees-login-column.png");
});

test("AC-EMP-116 AC-EMP-117 AC-EMP-118 nút Xuất Excel: desktop tải CSV theo bộ lọc, điện thoại ẩn", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("button", { name: "Thêm nhân viên" })).toBeVisible();
  const exportLink = page.getByRole("link", { name: "Xuất Excel" });

  if (info.project.name === "mobile") {
    await expect(exportLink).toBeHidden();
    return;
  }

  await expect(exportLink).toBeVisible();
  expect((await exportLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(exportLink).toHaveAttribute("href", /\/api\/v1\/employees\/export$/);

  // Như customers.spec.ts: gọi lại đúng href bằng page.request (chung cookie phiên).
  const href = await exportLink.getAttribute("href");
  if (href === null) throw new Error("export link missing href");
  await exportLink.click();
  await expect(page.getByRole("heading", { level: 1, name: "Nhân sự & phân quyền" })).toBeVisible();
  const response = await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"] ?? "").toMatch(
    /filename="nhan-vien-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  const body = await response.body();
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(body.subarray(3).toString("utf-8")).toMatch(/^Mã NV,Họ tên,Tài khoản đăng nhập/);
  expect(body.toString("utf-8")).toContain("E2E01");

  await page.getByLabel("Tìm kiếm").fill("Minh");
  await page.getByLabel("Vai trò").selectOption("SALE");
  await page.getByLabel("Trạng thái").selectOption("true");
  await expect(exportLink).toHaveAttribute(
    "href",
    /\/api\/v1\/employees\/export\?q=Minh&role=SALE&is_active=true$/,
  );
});

test("AC-EMP-117 QLKT không thấy nút Xuất Excel", async ({ page }) => {
  await signIn(page, TECH_LEAD);
  await expect(page.getByRole("heading", { level: 1, name: "Nhân sự & phân quyền" })).toBeVisible();
  await expect(page.getByRole("table").or(page.getByRole("list")).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Xuất Excel" })).toHaveCount(0);
});

test("AC-EMP-123 AC-EMP-124 @a11y @screenshot cấp lại mật khẩu: giờ hết hạn trong hộp thoại và trên sheet", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const createForm = page.getByRole("dialog", { name: "Thêm nhân viên" });
  const name = "QA Hết Hạn";
  const email = `qa.expiry.${info.project.name}.${String(Date.now())}@smyou.vn`;
  await createForm.getByLabel("Họ và tên").fill(name);
  await createForm.getByLabel("Email").fill(email);
  await createForm.getByLabel("Phòng ban").selectOption({ label: "Phát Triển Kinh Tế" });
  await createForm.getByRole("checkbox", { name: "Nhân viên kỹ thuật" }).check();
  await createForm.getByRole("button", { name: "Lưu" }).click();
  const expiryLine =
    /^Hết hạn lúc \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}\. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu\.$/;
  const created = page.getByRole("dialog", { name: "Mật khẩu tạm" });
  await expect(created.getByText(expiryLine)).toBeVisible();
  await created.getByRole("button", { name: "Đóng", exact: true }).click();

  await page.getByLabel("Tìm kiếm").fill(email);
  await page
    .locator("li, tr")
    .filter({ hasText: email })
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  const editDialog = page.getByRole("dialog", { name: "Sửa nhân viên" });
  await expect(editDialog.getByText(/^Mật khẩu tạm — hết hạn lúc /)).toBeVisible();
  await editDialog.getByRole("button", { name: "Cấp lại mật khẩu" }).click();
  await page
    .getByRole("dialog", { name: "Cấp lại mật khẩu" })
    .getByRole("button", { name: "Cấp lại mật khẩu" })
    .click();
  const passwordDialog = page.getByRole("dialog", { name: "Mật khẩu tạm" });
  await expect(passwordDialog.getByText(expiryLine)).toBeVisible();
  await expect(passwordDialog.getByRole("button", { name: "Sao chép" })).toBeVisible();
  await evidence(page, info, "temporary-password-expiry.png");
  await passwordDialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await evidence(page, info, "employee-sheet-temp-password-status.png");
});

test("AC-UI-104 AC-UI-107 @screenshot Ngày sinh sau hôm nay báo lỗi tiếng Việt; lịch vừa màn hình", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const form = page.getByRole("dialog", { name: "Thêm nhân viên" });
  const birth = form.getByLabel("Ngày sinh");
  await birth.pressSequentially("05112099");
  await birth.blur();
  await expect(form.getByText(/^Ngày không được sau \d{2}\/\d{2}\/\d{4}\.$/)).toBeVisible();
  await expect(birth).toHaveAttribute("aria-invalid", "true");

  await birth.fill("");
  await birth.pressSequentially("20051995");
  await birth.blur();
  await expect(birth).toHaveValue("20/05/1995");
  await expect(birth).not.toHaveAttribute("aria-invalid", "true");

  await expectPickerFits(page, "Ngày sinh");
  await evidence(page, info, "employee-form-datefield.png");
});

test("AC-SYS-154 seed_e2e dọn NV do lượt chạy trước tạo: chỉ còn NV test của lượt hiện tại", async ({
  page,
}) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("heading", { level: 1, name: "Nhân sự & phân quyền" })).toBeVisible();
  type Row = { full_name: string; email: string };
  const all: Row[] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await page.request.get(`api/v1/employees?limit=100&offset=${String(offset)}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { items: Row[]; total: number };
    all.push(...body.items);
    if (body.items.length === 0 || all.length >= body.total) break;
  }
  // non-vacuous: the listing really covers the DB (fixture manager present)
  expect(all.map((e) => e.email)).toContain(MANAGER);
  // every e2e-created employee stamps Date.now() into its name ("Phạm Văn Khoa desktop 17…",
  // "Kim Yến mobile 17…") or email ("qa.lock.mobile.17…@"); older than this run (< 1h) → purged
  const stamps = all
    .map((e) => /\b(1\d{12})\b/.exec(`${e.full_name} ${e.email}`)?.[1])
    .filter((s): s is string => s !== undefined)
    .map(Number);
  const runStart = Date.now() - 60 * 60 * 1000;
  expect(stamps.filter((s) => s < runStart)).toEqual([]);
});
