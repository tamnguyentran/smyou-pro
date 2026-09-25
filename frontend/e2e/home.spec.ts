import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const SUBPATH = "/smyoutask/";

async function openHome(page: Page) {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "SMYou Pro" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test("AC-SYS-015 trang chủ chạy dưới /smyoutask/: nội dung, asset 200, không lỗi console", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  const assets: { url: string; status: number; type: string }[] = [];
  page.on("response", (res) => {
    const type = res.request().resourceType();
    if (["script", "stylesheet", "font"].includes(type)) {
      assets.push({ url: res.url(), status: res.status(), type });
    }
  });

  await openHome(page);
  await expect(page.getByText("Quản lý đơn hàng và đầu việc kỹ thuật")).toBeVisible();
  await page.waitForLoadState("networkidle");

  const types = new Set(assets.map((a) => a.type));
  expect(types).toEqual(new Set(["script", "stylesheet", "font"]));
  for (const asset of assets) {
    expect(new URL(asset.url).pathname, asset.url).toMatch(new RegExp(`^${SUBPATH}`));
    expect(asset.status, asset.url).toBe(200);
  }
  expect(errors).toEqual([]);
});

test("AC-SYS-003 không cuộn ngang ở viewport của thiết bị và ở 360px", async ({ page }) => {
  await openHome(page);
  expect(await hasHorizontalScroll(page)).toBe(false);

  await page.setViewportSize({ width: 360, height: 780 });
  await openHome(page);
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test("AC-SYS-016 @a11y không có vi phạm axe mức serious/critical", async ({ page }) => {
  await openHome(page);
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("AC-SYS-018 @screenshot font Plus Jakarta Sans và nền token page", async ({
  page,
}, testInfo) => {
  await openHome(page);
  const style = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    return {
      font: h1 ? getComputedStyle(h1).fontFamily : "",
      loaded: [...document.fonts].some(
        (face) => face.family.includes("Plus Jakarta Sans Variable") && face.status === "loaded",
      ),
      background: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(style.font).toMatch(/^"?Plus Jakarta Sans Variable/);
  expect(style.loaded).toBe(true);
  expect(style.background).toBe("rgb(248, 250, 252)");

  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      "../../reports/screenshots",
      testInfo.project.name,
      "home.png",
    ),
    fullPage: true,
  });
});
