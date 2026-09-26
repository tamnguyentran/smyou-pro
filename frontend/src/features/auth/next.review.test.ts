import { expect, test } from "vitest";
import { safeNext } from "./next";

// Security review M1-01b: control characters are stripped by URL parsing ("/\t/evil" → "//evil"),
// which crashed the sign-in page on redirect.
test.each(["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\u0000x", "/\u007fx"])(
  "AC-AUTH-023 ký tự điều khiển trong next %j → trang chủ",
  (raw) => {
    expect(safeNext(raw)).toBe("/");
  },
);
