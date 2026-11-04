import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const SALE = "hoa.e2e@smyou.vn";
const TECH_LEAD = "tuan.lead@smyou.vn";
const TECHNICIAN = "duc.ktv3@smyou.vn";
const MANAGER = "an.e2e@smyou.vn";
const CUSTOMER_CARE = "lan.cskh@smyou.vn";

async function signIn(page: Page, email: string, path: string) {
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
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  // Sidebar nav "active" background still has a CSS transition `document.getAnimations()`
  // doesn't always report finished for right after a client-side navigation; without this,
  // axe occasionally samples the sidebar mid-transition (flaky color-contrast on the old item).
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await page.screenshot({ path: shot(info, file), fullPage: true });
}

test("AC-DASH-077 AC-DASH-078 AC-DASH-085 AC-DASH-031 @a11y @screenshot Hoa (SALE) bấm thẻ 'Chờ điều phối' → popup danh sách, URL không đổi; Excel chỉ desktop", async ({
  page,
}, info) => {
  await signIn(page, SALE, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const orderSection = page.locator("section", {
    has: page.getByRole("heading", { name: "Đơn theo trạng thái" }),
  });
  const tile = orderSection.getByRole("button", { name: /Chờ điều phối/ });
  const count = (await tile.locator("p").nth(1).textContent())?.trim() ?? "";
  await evidence(page, info, "dashboard-card-tiles.png");

  await tile.click();
  const dialog = page.getByRole("dialog", { name: `Chờ điều phối (${count})` });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const labelledBy = await dialog.getAttribute("aria-labelledby");
  expect(labelledBy).toBeTruthy();
  await expect(page.locator(`[id="${labelledBy ?? ""}"]`)).toHaveText(`Chờ điều phối (${count})`);

  // Bằng chứng ảnh phải có dòng thật (seed có đơn Chờ điều phối của Hoa), không phải trạng thái rỗng.
  expect(count).not.toBe("0");
  await expect(dialog.getByRole("link").first()).toBeVisible();

  const size = page.viewportSize();
  const desktop = (size?.width ?? 0) >= 1024;
  if (desktop) {
    await expect(dialog.getByRole("columnheader", { name: "Mã đơn" })).toBeVisible();
    if (count !== "0") {
      await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toBeVisible();
    }
  } else {
    await expect(dialog.getByTestId("sheet-panel")).toHaveClass(/bottom-0/);
    await expect(dialog.getByRole("table")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toHaveCount(0);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(overflow).toBe(true);
  await evidence(page, info, "dashboard-card-popup-pending-dispatch.png");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(tile).toBeFocused();
});

test("AC-DASH-079 AC-DASH-085 @a11y @screenshot Tuấn (TECH_LEAD) bấm 'Quá hạn' (khối Điều phối) → popup 'Đầu việc quá hạn'", async ({
  page,
}, info) => {
  await signIn(page, TECH_LEAD, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const dispatchSection = page.locator("section", {
    has: page.getByRole("heading", { name: "Điều phối" }),
  });
  await dispatchSection.getByRole("button", { name: /Quá hạn/ }).click();
  const dialog = page.getByRole("dialog", { name: /^Đầu việc quá hạn \([1-9]\d*\)$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("link").first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await evidence(page, info, "dashboard-card-popup-overdue-tasks.png");
});

async function openPopup(page: Page, section: string, tile: RegExp) {
  const block = page.locator("section", { has: page.getByRole("heading", { name: section }) });
  const button = block.getByRole("button", { name: tile });
  await expect(button).toHaveAttribute("aria-haspopup", "dialog");
  await button.click();
  return button;
}

async function noHorizontalScroll(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(fits).toBe(true);
}

test("AC-DASH-098 AC-DASH-103 @a11y @screenshot Tuấn (TECH_LEAD) bấm thẻ khối Đầu việc + Nhân sự → popup, URL không đổi", async ({
  page,
}, info) => {
  await signIn(page, TECH_LEAD, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  await openPopup(page, "Đầu việc theo trạng thái", /Cần giao lại/);
  const tasks = page.getByRole("dialog", { name: /^Cần giao lại \([1-9]\d*\)$/ });
  await expect(tasks).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(tasks.getByRole("link").first()).toHaveAttribute("href", /\/orders\//);
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  if (desktop) {
    await expect(tasks.getByRole("columnheader", { name: "KTV" })).toBeVisible();
    await expect(tasks.getByRole("button", { name: /Xuất Excel/ })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(tasks).toHaveCount(0);

  const tile = await openPopup(page, "Nhân sự kỹ thuật", /Chờ giao việc/);
  const staff = page.getByRole("dialog", { name: /^Chờ giao việc \(\d+\)$/ });
  await expect(staff).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-staff.png");
  await page.keyboard.press("Escape");
  await expect(staff).toHaveCount(0);
  await expect(tile).toBeFocused();
});

test("AC-DASH-100 AC-DASH-103 @a11y @screenshot Đức (TECHNICIAN) bấm 'Quá hạn chưa hoàn thành' → chỉ việc của Đức; mobile là sheet, không Excel", async ({
  page,
}, info) => {
  await signIn(page, TECHNICIAN, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  await openPopup(page, "Đầu việc của tôi", /Quá hạn chưa hoàn thành/);
  const dialog = page.getByRole("dialog", { name: /^Quá hạn chưa hoàn thành \([1-9]\d*\)$/ });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog.getByText("E2E-DH-M1801C-T1")).toBeVisible();
  await expect(dialog.getByText("Đã nhận")).toBeVisible();
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  if (desktop) {
    await expect(dialog.getByRole("columnheader", { name: "Trạng thái" })).toBeVisible();
    await expect(dialog.getByRole("columnheader", { name: "KTV" })).toHaveCount(0);
  } else {
    await expect(dialog.getByTestId("sheet-panel")).toHaveClass(/bottom-0/);
    await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toHaveCount(0);
  }
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-my-overdue.png");
});

test("AC-DASH-054 AC-DASH-056 AC-DASH-058 AC-DASH-059 @a11y @screenshot An (MANAGER) thấy Top 10 khách hàng + tổng hợp đánh giá trên Tổng quan", async ({
  page,
}, info) => {
  await signIn(page, MANAGER, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  await expect(page.getByText("Top 10 khách hàng (tháng này)")).toBeVisible();
  await expect(page.getByText("E2E-KH-001")).toBeVisible();
  await expect(page.getByText("Phản hồi – đánh giá từ khách hàng (tháng này)")).toBeVisible();
  await expect(page.getByText("5★")).toBeVisible();

  await evidence(page, info, "dashboard-top-customers-feedback-summary.png");
});

test("AC-DASH-116 AC-DASH-120 AC-DASH-122 @a11y @screenshot Lan (CSKH) bấm 'KH đã gọi' + '2★' → popup phản hồi; mobile là sheet, không Excel", async ({
  page,
}, info) => {
  await signIn(page, CUSTOMER_CARE, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;

  const tile = await openPopup(page, "Chăm sóc khách hàng (tháng này)", /KH đã gọi/);
  const care = page.getByRole("dialog", { name: /^KH đã gọi \([1-9]\d*\)$/ });
  await expect(care).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(care.getByRole("link").first()).toHaveAttribute("href", /\/orders\//);
  if (desktop) {
    await expect(care.getByRole("columnheader", { name: "Số sao" })).toBeVisible();
    await expect(care.getByRole("button", { name: /Xuất Excel/ })).toBeVisible();
  } else {
    await expect(care.getByTestId("sheet-panel")).toHaveClass(/bottom-0/);
    await expect(care.getByRole("button", { name: /Xuất Excel/ })).toHaveCount(0);
  }
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-care-customers.png");
  await page.keyboard.press("Escape");
  await expect(care).toHaveCount(0);
  await expect(tile).toBeFocused();

  await openPopup(page, "Phản hồi – đánh giá từ khách hàng (tháng này)", /^2★/);
  const twoStars = page.getByRole("dialog", { name: /^Đánh giá 2★ \([1-9]\d*\)$/ });
  await expect(twoStars).toBeVisible();
  await expect(twoStars.getByText("2★").first()).toBeVisible();
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-feedback.png");
});

test("AC-DASH-119 AC-DASH-120 AC-DASH-122 @a11y @screenshot An (MANAGER) bấm khách E2E-KH-001 trong Top 10 → popup đơn hoàn tất của khách", async ({
  page,
}, info) => {
  await signIn(page, MANAGER, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  await openPopup(page, "Top 10 khách hàng (tháng này)", /E2E-KH-001/);
  const dialog = page.getByRole("dialog", { name: /\(E2E-KH-001\) \([1-9]\d*\)$/ });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog.getByRole("link", { name: "E2E-DH-M1504A" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toBeVisible();
  } else {
    await expect(dialog.getByRole("button", { name: /Xuất Excel/ })).toHaveCount(0);
  }
  await noHorizontalScroll(page);
  await evidence(page, info, "dashboard-card-popup-top-customer.png");
});

/** Top of each tile's bounding box in the section grid, in DOM order. */
async function tileBoxes(page: Page, section: string, count = 4) {
  const block = page.locator("section", { has: page.getByRole("heading", { name: section }) });
  const tiles = block.locator(".grid > button");
  await expect(tiles).toHaveCount(count);
  for (const tile of await tiles.all()) await expect(tile).toBeVisible();
  // Measure all tiles in one frame: sections above can finish loading and shift
  // the layout between per-tile boundingBox() calls.
  const measured = await tiles.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      // Grid items stretch anyway; the visible coloured card inside must fill the button too.
      const card = el.firstElementChild?.getBoundingClientRect().height ?? 0;
      return { x: r.x, y: r.y, width: r.width, height: r.height, card };
    }),
  );
  expect(measured).toHaveLength(count);
  for (const { height, card } of measured) {
    expect(Math.abs(card - height), `${section}: thẻ màu lấp đầy ô lưới`).toBeLessThanOrEqual(1);
  }
  const boxes = measured.map(({ x, y, width, height }) => ({ x, y, width, height }));
  return { tiles, boxes };
}

test("AC-UI-054 AC-UI-055 @screenshot Tuấn (TECH_LEAD): 'Điều phối' + 'Nhân sự kỹ thuật' 2×2 trên điện thoại, 1 hàng 4 thẻ trên tablet/desktop", async ({
  page,
}, info) => {
  await signIn(page, TECH_LEAD, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  const widths = desktop ? [1440, 768] : [page.viewportSize()?.width ?? 390];

  for (const width of widths) {
    if (desktop) await page.setViewportSize({ width, height: 900 });
    for (const section of ["Điều phối", "Nhân sự kỹ thuật"]) {
      const { tiles, boxes } = await tileBoxes(page, section);
      type Box = { x: number; y: number; width: number; height: number };
      const [a, b, c, d] = boxes as [Box, Box, Box, Box];
      if (desktop) {
        const where = `AC-UI-055 ${section} @${String(width)}px`;
        expect(new Set(boxes.map((box) => Math.round(box.y))).size, where).toBe(1);
        expect(new Set(boxes.map((box) => Math.round(box.width))).size, where).toBe(1);
        for (const tile of await tiles.all()) {
          const label = tile.locator("p").first();
          const overflow = await label.evaluate((el) => el.scrollWidth > el.clientWidth);
          expect(overflow).toBe(false);
        }
      } else {
        expect(Math.round(a.y)).toBe(Math.round(b.y));
        expect(Math.round(c.y)).toBe(Math.round(d.y));
        expect(c.y).toBeGreaterThan(a.y);
      }
      for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await noHorizontalScroll(page);
  }
  if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
  await evidence(page, info, "dashboard-dispatch-staff-grid.png");
});

type Box = { x: number; y: number; width: number; height: number };

function sameHeight(boxes: Box[], where: string) {
  const heights = boxes.map((box) => box.height);
  expect(Math.max(...heights) - Math.min(...heights), where).toBeLessThanOrEqual(1);
}

test("AC-UI-071 AC-UI-072 @screenshot 'Chăm sóc khách hàng': thẻ 'KH đã gọi' trọn hàng 1 trên điện thoại, 3 thẻ 1 hàng cao đều trên tablet/desktop", async ({
  page,
}, info) => {
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  // M21-03: Manager/CSKH có thêm thẻ thứ 4 (test AC-DASH-129 bên dưới); SALE/QLKT giữ 3 thẻ.
  await signIn(page, desktop ? TECH_LEAD : SALE, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const section = "Chăm sóc khách hàng (tháng này)";
  const widths = desktop ? [1440, 768] : [page.viewportSize()?.width ?? 390];

  for (const width of widths) {
    if (desktop) await page.setViewportSize({ width, height: 900 });
    const { tiles, boxes } = await tileBoxes(page, section, 3);
    const [first, second, third] = boxes as [Box, Box, Box];
    await expect(tiles.first().locator("p").first()).toHaveText("KH đã gọi");
    await expect(tiles.first()).toContainText(/Hôm nay: \d+/);
    if (desktop) {
      const where = `AC-UI-072 @${String(width)}px`;
      expect(new Set(boxes.map((box) => Math.round(box.y))).size, where).toBe(1);
      expect(new Set(boxes.map((box) => Math.round(box.width))).size, where).toBe(1);
      sameHeight(boxes, where);
      for (const tile of await tiles.all()) {
        const label = tile.locator("p").first();
        const overflow = await label.evaluate((el) => el.scrollWidth > el.clientWidth);
        expect(overflow, where).toBe(false);
      }
    } else {
      const grid = page
        .locator("section", { has: page.getByRole("heading", { name: section }) })
        .locator(".grid");
      const gridWidth = (await grid.boundingBox())?.width ?? 0;
      expect(Math.abs(first.width - gridWidth), "AC-UI-071 thẻ 1 rộng cả lưới").toBeLessThanOrEqual(
        1,
      );
      expect(Math.round(second.y)).toBe(Math.round(third.y));
      expect(second.y).toBeGreaterThan(first.y + first.height - 1);
      expect(Math.round(second.width)).toBe(Math.round(third.width));
      sameHeight([second, third], "AC-UI-071 hàng 2");
    }
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    await noHorizontalScroll(page);
  }
  if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
  await evidence(page, info, "dashboard-care-section-grid.png");
  // Full-page capture crops the inner scroll area / overlays the fixed bottom nav: also shoot the section alone.
  await page
    .locator("section", { has: page.getByRole("heading", { name: section }) })
    .screenshot({ path: shot(info, "dashboard-care-section-only.png") });
});

test("AC-DASH-129 @a11y @screenshot 'Chăm sóc khách hàng' có thẻ 'Đơn ghi doanh số': 2×2 trên điện thoại (CSKH), 1 hàng 4 thẻ cao đều trên tablet/desktop (Manager)", async ({
  page,
}, info) => {
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  await signIn(page, desktop ? MANAGER : CUSTOMER_CARE, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const section = "Chăm sóc khách hàng (tháng này)";
  // 1440 last: resizing re-mounts the section, so the screenshot below must not follow a resize.
  const widths = desktop ? [768, 1440] : [page.viewportSize()?.width ?? 390];

  for (const width of widths) {
    if (desktop) await page.setViewportSize({ width, height: 900 });
    const { tiles, boxes } = await tileBoxes(page, section, 4);
    const credited = tiles.nth(3);
    await expect(credited.locator("p").first()).toHaveText("Đơn ghi doanh số");
    await expect(credited).toContainText(desktop ? "Của CSKH" : "Của tôi");
    const [a, b, c, d] = boxes as [Box, Box, Box, Box];
    const where = `AC-DASH-129 @${String(width)}px`;
    if (desktop) {
      expect(new Set(boxes.map((box) => Math.round(box.y))).size, where).toBe(1);
      expect(new Set(boxes.map((box) => Math.round(box.width))).size, where).toBe(1);
      sameHeight(boxes, where);
    } else {
      expect(Math.round(a.y), where).toBe(Math.round(b.y));
      expect(Math.round(c.y), where).toBe(Math.round(d.y));
      expect(c.y, where).toBeGreaterThan(a.y);
      sameHeight([a, b], `${where} hàng 1`);
      sameHeight([c, d], `${where} hàng 2`);
    }
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    await noHorizontalScroll(page);
  }
  await page
    .locator("section", { has: page.getByRole("heading", { name: section }) })
    .screenshot({ path: shot(info, "dashboard-care-credited-orders.png") });

  await page.getByRole("button", { name: /Đơn ghi doanh số/ }).click();
  await expect(page.getByRole("dialog", { name: /^Đơn ghi doanh số/ })).toBeVisible();
  await evidence(page, info, "dashboard-card-popup-credited-orders.png");
});

test("AC-UI-073 Tuấn (TECH_LEAD): 'Điều phối' sau khi thẻ h-full — thẻ cùng hàng cao bằng nhau, không cao bất thường", async ({
  page,
}) => {
  await signIn(page, TECH_LEAD, "/");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  const { boxes } = await tileBoxes(page, "Điều phối");
  const [a, b, c, d] = boxes as [Box, Box, Box, Box];
  if (desktop) {
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
    sameHeight(boxes, "AC-UI-073 1 hàng");
  } else {
    sameHeight([a, b], "AC-UI-073 hàng 1");
    sameHeight([c, d], "AC-UI-073 hàng 2");
  }
  // Thẻ 1 số (nhãn + số lớn, p-5) ~ 100px; h-full không được kéo giãn theo phần tử khác.
  for (const box of boxes) expect(box.height).toBeLessThanOrEqual(160);
});
