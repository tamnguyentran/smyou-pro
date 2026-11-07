import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

const BG = /login-bg-deepmind/;

function shot(info: TestInfo, name: string) {
  return resolve(import.meta.dirname, "../../reports/screenshots", info.project.name, name);
}

/** Every request URL the page makes while opening the login page at the given viewport. */
async function openLogin(page: Page, width: number, height: number) {
  const urls: string[] = [];
  page.on("request", (req) => urls.push(req.url()));
  await page.setViewportSize({ width, height });
  await page.goto("./dang-nhap");
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  return urls;
}

for (const [width, height] of [
  [1440, 900],
  [768, 1024],
] as const) {
  test(`AC-UI-077 ${String(width)}px: ảnh nền login-bg-deepmind được tải, nằm sau thẻ form, axe sạch`, async ({
    page,
  }, info) => {
    const urls = await openLogin(page, width, height);
    expect(urls.some((u) => BG.test(u))).toBe(true);

    const main = page.getByRole("main");
    const bg = await main.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toMatch(BG);
    // The form card still sits on top of the image, opaque and readable.
    const card = main.locator("section");
    await expect(card).toBeVisible();
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toMatch(
      /^(transparent|rgba\(0, 0, 0, 0\))$/,
    );

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking).toEqual([]);
    await page.screenshot({ path: shot(info, `login-background-${String(width)}.png`) });
  });
}

test("AC-UI-078 390px: không tải ảnh nền login-bg-deepmind, nền như cũ, không cuộn ngang", async ({
  page,
}, info) => {
  const urls = await openLogin(page, 390, 844);
  expect(urls.filter((u) => BG.test(u))).toEqual([]);
  const bg = await page.getByRole("main").evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: shot(info, "login-background-390.png") });
});

test("AC-UI-078 767px: ngay dưới ngưỡng md vẫn không tải ảnh nền", async ({ page }) => {
  const urls = await openLogin(page, 767, 1024);
  expect(urls.filter((u) => BG.test(u))).toEqual([]);
});
