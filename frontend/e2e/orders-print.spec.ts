import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loginName } from "./loginName";

// Accounts/catalog created by backend/scripts/seed_e2e.py (reset before every `make e2e`).
const PASSWORD = "E2e@SmYou2026";
const SALE = "hoa.e2e@smyou.vn";

async function signIn(page: Page, email: string, path = "/orders") {
  await page.goto(`./dang-nhap?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Tên đăng nhập").fill(loginName(email));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

function shot(info: TestInfo, file: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, file);
}

const isMobile = (info: TestInfo) => info.project.name === "mobile";

interface OrderJson {
  id: string;
  code: string;
  version: number;
}

/** Draft with `lines` Dell lines, created through the API (same cookie as the signed-in page). */
async function createDraft(page: Page, lines: number): Promise<OrderJson> {
  const products = await page.request.get("api/v1/products", { params: { q: "E2E-MON-001" } });
  const [product] = ((await products.json()) as { items: { id: string }[] }).items;
  const groups = await page.request.get("api/v1/product-service-groups");
  const [group] = ((await groups.json()) as { items: { id: string }[] }).items;
  if (!product || !group) throw new Error("seed_e2e.py catalog missing");
  const created = await page.request.post("api/v1/orders", {
    data: {
      customer_name: "KHÁCH LẺ - BP MÁY IN E2E",
      customer_phone: "0903667344",
      division_id: group.id,
      service_address: "45 Nguyễn Huệ, Q1, TP.HCM",
      work_description: "ANH THANH TUẤN - 0903.667.344",
    },
  });
  expect(created.status()).toBe(201);
  let order = (await created.json()) as OrderJson;
  for (let i = 0; i < lines; i += 1) {
    const res = await page.request.post(`api/v1/orders/${order.id}/lines`, {
      data: {
        version: order.version,
        item_type: "PRODUCT",
        product_id: product.id,
        quantity: "1",
        unit_price: 2_800_000,
      },
    });
    expect(res.status()).toBe(201);
    order = (await res.json()) as OrderJson;
  }
  return order;
}

test("AC-ORD-207 AC-ORD-208 @screenshot nút In chỉ có trên desktop (chi tiết đơn + đơn nháp)", async ({
  page,
}, info) => {
  await signIn(page, SALE);
  const draft = await createDraft(page, 2);

  await page.goto(`./orders/${draft.id}`);
  await expect(page.getByRole("button", { name: "Lưu nháp" })).toBeVisible();
  if (isMobile(info)) {
    await expect(page.getByRole("button", { name: "In", exact: true })).toHaveCount(0);
  } else {
    await expect(page.getByRole("button", { name: "In", exact: true })).toBeEnabled();
  }

  const submitted = await page.request.post(`api/v1/orders/${draft.id}/submit`, {
    data: { version: draft.version },
  });
  expect(submitted.status()).toBe(200);
  await page.goto(`./orders/${draft.id}`);
  await expect(page.getByText(draft.code).first()).toBeVisible();
  const print = page.getByRole("button", { name: "In", exact: true });
  if (isMobile(info)) {
    await expect(print).toHaveCount(0);
    await page.screenshot({ path: shot(info, "order-print-button-390.png"), fullPage: true });
    return;
  }
  await expect(print).toBeVisible();
  expect((await print.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: shot(info, "order-print-button-1440.png"), fullPage: true });

  // Tablet 768px: không render (không chỉ ẩn bằng CSS).
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByText(draft.code).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "In", exact: true })).toHaveCount(0);
});

test("AC-ORD-215 @screenshot bản in A5 ngang 25 dòng: chỉ bản in hiện, tiêu đề cột lặp lại", async ({
  page,
}, info) => {
  await signIn(page, SALE);
  const draft = await createDraft(page, 25);
  await page.goto(`./orders/${draft.id}`);
  await expect(page.getByRole("button", { name: "Lưu nháp" })).toBeVisible();
  if (isMobile(info)) {
    // In chỉ có trên desktop (AC-ORD-208) — ở mobile chỉ xác nhận không có đường vào bản in.
    await expect(page.getByRole("button", { name: "In", exact: true })).toHaveCount(0);
    return;
  }
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed += 1;
    };
  });

  await page.getByRole("button", { name: "In", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed))
    .toBe(1);

  const sheet = page.getByTestId("invoice-print");
  await expect(sheet).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(sheet).toBeVisible();
  // Lay the sheet out at the printable width of A5 landscape (210 − 2 × 8 mm side margins = 194 mm
  // ≈ 733 px): the table must not run past the sheet's right edge (the page would clip it).
  await page.setViewportSize({ width: 733, height: 900 });
  const overflow = await sheet.evaluate((el) => {
    const table = el.querySelector("table");
    return (table?.getBoundingClientRect().right ?? Infinity) - el.getBoundingClientRect().right;
  });
  // ≤ −1: room for the outer half of the collapsed right border, which lies outside the table box.
  expect(overflow).toBeLessThanOrEqual(-1);
  await expect(page.locator("#root")).toBeHidden();
  await expect(sheet.getByText("HÓA ĐƠN BÁN HÀNG")).toBeVisible();
  await expect(sheet.getByText(/^\d{2,}-XBH\d{8}$/)).toBeVisible();
  await expect(sheet.getByRole("row")).toHaveCount(27); // 2 header rows + 25 lines
  expect(await sheet.locator("thead").evaluate((el) => getComputedStyle(el).display)).toBe(
    "table-header-group",
  );
  await page.screenshot({ path: shot(info, "order-invoice-print-a5.png"), fullPage: true });

  const pdf = await page.pdf({ preferCSSPageSize: true });
  // Bằng chứng khổ giấy thật (ảnh chụp ở trên là khung nhìn màn hình, không phải trang A5).
  await writeFile(shot(info, "order-invoice-print-a5.pdf"), pdf);
  // A5 ngang = 210 × 148 mm ≈ 595.3 × 419.5 pt; 25 dòng tràn sang trang 2.
  const text = pdf.toString("latin1");
  const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
  expect(Number(box?.[1])).toBeCloseTo(595.3, -0.3); // ± 1pt (Chromium rounds A5 to 594.96 / 420)
  expect(Number(box?.[2])).toBeCloseTo(419.5, -0.3);
  expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
});
