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
  await form.getByLabel("Phòng ban").selectOption({ label: "Kinh doanh" });
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
  await form.getByLabel("Phòng ban").selectOption({ label: "Kinh doanh" });
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
  await createForm.getByLabel("Phòng ban").selectOption({ label: "Kỹ thuật" });
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
  await form.getByLabel("Phòng ban").selectOption({ label: "Nhân sự/marketing" });
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
    "Nhân sự/marketing",
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
  await form.getByLabel("Ngày sinh").fill("1985-07-30");
  await form.getByLabel("Nơi sinh").fill("An Giang");
  await form.getByLabel("Giới tính").selectOption({ label: "Nữ" });
  await form.getByLabel("SĐT").fill("0932068787");
  await form.getByLabel("Địa chỉ").fill("12 Trần Hưng Đạo, Long Xuyên, An Giang");
  await form.getByLabel("CMND/CCCD").fill("089185000565");
  await form.getByLabel("Ngày cấp").fill("2018-10-08");
  await form.getByLabel("Nơi cấp").fill("Cục Cảnh sát QLHC về TTXH");
  await form.getByLabel("Tình trạng hôn nhân").selectOption({ label: "Đã kết hôn" });
  await form.getByLabel("Phòng ban").selectOption({ label: "Kinh doanh" });
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
  await expect(edit.getByLabel("Ngày sinh")).toHaveValue("1985-07-30");
  await expect(edit.getByLabel("Nơi sinh")).toHaveValue("An Giang");
  await expect(edit.getByLabel("Giới tính").locator("option:checked")).toHaveText("Nữ");
  await expect(edit.getByLabel("Địa chỉ")).toHaveValue("12 Trần Hưng Đạo, Long Xuyên, An Giang");
  await expect(edit.getByLabel("Email")).toHaveValue("");
  await expect(edit.getByLabel("CMND/CCCD")).toHaveValue("089185000565");
  await expect(edit.getByLabel("Ngày cấp")).toHaveValue("2018-10-08");
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
  await form.getByLabel("Ngày sinh").fill("1985-07-30");
  await form.getByLabel("Phòng ban").selectOption({ label: "Kinh doanh" });
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
