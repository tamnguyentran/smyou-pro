import { describe, expect, test } from "vitest";
import { formatDateTime } from "./format";

describe("AC-SYS-072 formatDateTime: dd/MM/yyyy HH:mm, giờ Việt Nam (UI_GUIDELINES §6)", () => {
  test("đổi UTC sang Asia/Ho_Chi_Minh, đệm số 0, năm 4 chữ số, 24 giờ", () => {
    expect(formatDateTime("2026-09-19T18:05:00Z")).toBe("20/09/2026 01:05");
    expect(formatDateTime("2026-01-07T09:30:00Z")).toBe("07/01/2026 16:30");
  });
});
