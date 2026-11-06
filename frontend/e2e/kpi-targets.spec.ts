import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const MANAGER = "an.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/settings/kpi-targets") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

async function evidence(page: Page, info: TestInfo, file: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  // Viewport only: one card per employee makes a full-page mobile capture ~100k px tall.
  await page.screenshot({ path: shot(info, file) });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("AC-KPI-054 @a11y @screenshot Thiết lập doanh thu KPI: thẻ (mobile) / bảng (desktop)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(
    page.getByRole("heading", { level: 1, name: "Thiết lập doanh thu KPI" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tháng", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Phòng ban", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Tìm")).toBeVisible();
  const copy = page.getByRole("button", { name: "Copy sang tháng sau" });
  expect((await copy.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const edit = page.getByRole("button", { name: "Sửa chỉ tiêu của Nguyễn Văn An" });
  if (info.project.name === "desktop") {
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveText([
      "Mã NV",
      "Họ tên",
      "Phòng ban",
      "Chỉ tiêu thu nhập thuần (VND)",
    ]);
    await expect(table.getByRole("row", { name: /E2E01/ })).toBeVisible();
  } else {
    await expect(page.getByRole("table")).toHaveCount(0);
    const card = page.getByRole("listitem").filter({ hasText: "E2E01" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Nguyễn Văn An")).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Sửa chỉ tiêu của Nguyễn Văn An" }),
    ).toBeVisible();
  }
  expect((await edit.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await evidence(page, info, "kpi-targets.png");

  await edit.click();
  await expect(page.getByLabel("Chỉ tiêu của Nguyễn Văn An")).toBeVisible();
  const save = page.getByRole("button", { name: "Lưu" });
  expect((await save.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await evidence(page, info, "kpi-targets-editing.png");
});

const ECONOMIC = "d4444444-4444-4444-8444-444444444444";

/** M21-01c: top the company up to ≥ 45 active employees through the API (same session cookie). */
async function ensureFortyFive(page: Page, info: TestInfo): Promise<number> {
  const month = new Date().toISOString().slice(0, 7);
  const list = await page.request.get(`api/v1/kpi-targets?month=${month}&limit=1`);
  expect(list.status()).toBe(200);
  const { total } = (await list.json()) as { total: number };
  for (let i = total; i < 45; i++) {
    const res = await page.request.post("api/v1/employees", {
      data: {
        full_name: `Nhân viên KPI ${info.project.name} ${String(i + 1)}`,
        department_id: ECONOMIC,
        roles: ["SALE"],
      },
    });
    expect(res.status()).toBe(201);
  }
  return Math.max(total, 45);
}

test("AC-KPI-068 @a11y @screenshot phân trang 20 nhân viên/trang: thẻ (mobile) / bảng (desktop)", async ({
  page,
}, info) => {
  await signIn(page, MANAGER);
  await expect(
    page.getByRole("heading", { level: 1, name: "Thiết lập doanh thu KPI" }),
  ).toBeVisible();
  const total = await ensureFortyFive(page, info);
  await page.reload();

  const next = page.getByRole("button", { name: "Trang sau" });
  const previous = page.getByRole("button", { name: "Trang trước" });
  await expect(page.getByText(new RegExp(`^1–20 / ${String(total)}$`))).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  for (const button of [next, previous]) {
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const items =
    info.project.name === "desktop"
      ? page
          .getByRole("table")
          .getByRole("row")
          .filter({ has: page.getByRole("cell") })
      : page
          .getByRole("listitem")
          .filter({ has: page.getByRole("button", { name: /^Sửa chỉ tiêu của / }) });
  await expect(items).toHaveCount(20);
  if (info.project.name !== "desktop") await expect(page.getByRole("table")).toHaveCount(0);

  // The bar sits below the list (cards or table).
  const lastItem = await items.last().boundingBox();
  const bar = await next.boundingBox();
  expect(bar?.y ?? 0).toBeGreaterThan((lastItem?.y ?? Infinity) + (lastItem?.height ?? 0) - 1);

  await next.scrollIntoViewIfNeeded();
  await evidence(page, info, "kpi-targets-pagination.png");

  await next.click();
  await expect(page.getByText(new RegExp(`^21–40 / ${String(total)}$`))).toBeVisible();
  await expect(previous).toBeEnabled();
});

/** Current `YYYY-MM` in Vietnam time, plus the following month. */
function vnMonths(): { current: string; next: string } {
  const current = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })
    .format(new Date())
    .slice(0, 7);
  const [year, mon] = current.split("-").map(Number) as [number, number];
  const next =
    mon === 12 ? `${String(year + 1)}-01` : `${String(year)}-${String(mon + 1).padStart(2, "0")}`;
  return { current, next };
}

const display = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`;

test("AC-UI-091 AC-UI-093 @a11y @screenshot ô Tháng tiếng Việt + bảng chọn tháng gọn trong màn hình", async ({
  page,
}, info) => {
  const { current, next } = vnMonths();
  await signIn(page, MANAGER);
  const input = page.getByLabel("Tháng", { exact: true });
  await expect(input).toHaveValue(display(current));
  await expect(page.locator('input[type="month"]')).toHaveCount(0);
  await expect(page.getByText(`Tháng ${display(current)}`)).toBeVisible();

  const trigger = page.getByRole("button", { name: "Chọn tháng" });
  expect((await trigger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Chọn tháng" });
  await expect(dialog).toBeVisible();

  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  if (!viewport || !box) throw new Error("no layout");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  const columns = await dialog
    .getByTestId("month-grid")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(info.project.name === "desktop" ? 4 : 3);
  const inputBox = await input.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual((inputBox?.y ?? 0) + (inputBox?.height ?? 0));
  const th1 = await dialog.getByRole("button", { name: "Th1", exact: true }).boundingBox();
  expect(th1?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(th1?.width ?? 0).toBeGreaterThanOrEqual(44);
  await evidence(page, info, "kpi-targets-month-picker.png");

  const reload = page.waitForRequest(
    (req) =>
      req.url().includes("/api/v1/kpi-targets?") &&
      new URL(req.url()).searchParams.get("month") === next &&
      (new URL(req.url()).searchParams.get("offset") ?? "0") === "0",
  );
  if (next.endsWith("-01")) await dialog.getByRole("button", { name: "Năm sau" }).click();
  await dialog
    .getByRole("button", { name: `Th${String(Number(next.slice(5, 7)))}`, exact: true })
    .click();
  await reload;
  await expect(dialog).toHaveCount(0);
  await expect(input).toHaveValue(display(next));
});
