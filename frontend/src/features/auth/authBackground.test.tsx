import { cleanup, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "../../test/renderApp";

const PAGES = [
  { path: "/dang-nhap", heading: "Đăng nhập" },
  { path: "/quen-mat-khau", heading: "Quên mật khẩu" },
  { path: "/reset-password?token=abc123", heading: "Đặt lại mật khẩu" },
];

test("AC-UI-076 3 trang xác thực dùng chung khung có hình nền login-bg-deepmind từ md, không lớp phủ", async () => {
  const classNames: string[] = [];
  for (const { path, heading } of PAGES) {
    renderApp(path);
    await screen.findByRole("heading", { name: heading });
    const main = screen.getByRole("main");
    const classes = main.className.split(/\s+/);
    expect(classes.some((c) => /^md:bg-\[url\(.*login-bg-deepmind.*\)\]$/.test(c))).toBe(true);
    expect(classes).toContain("bg-cover");
    expect(classes).toContain("bg-center");
    // No dark/blur overlay layer: the form card is the only direct child of <main>.
    expect(main.children).toHaveLength(1);
    expect(main.children[0]?.tagName).toBe("SECTION");
    expect(main.querySelector("[class*='backdrop-blur'], [class*='bg-black']")).toBeNull();
    classNames.push(main.className);
    cleanup();
  }
  expect(new Set(classNames).size).toBe(1);
});
