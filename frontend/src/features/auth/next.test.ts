import { describe, expect, test } from "vitest";
import { safeNext } from "./next";

describe("safeNext", () => {
  test.each([
    ["/", "/"],
    ["/don-hang/123?tab=lich-su", "/don-hang/123?tab=lich-su"],
    ["/doi-mat-khau", "/doi-mat-khau"],
  ])("AC-AUTH-023 giữ đường dẫn nội bộ %s", (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });

  test.each([
    null,
    undefined,
    "",
    "don-hang",
    "https://evil.example/",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/dang-nhap?next=/",
  ])("AC-AUTH-023 không nhận %s → trang chủ", (raw) => {
    expect(safeNext(raw)).toBe("/");
  });
});
