import { describe, expect, test } from "vitest";
import { invoicePaper, MM } from "./invoicePaper";

describe("AC-ORD-277 chọn khổ giấy theo chiều cao bản in", () => {
  test("AC-ORD-277 ≤ 145 mm → A5, > 145 mm → A4", () => {
    expect(invoicePaper(0)).toBe("A5");
    expect(invoicePaper(100 * MM)).toBe("A5");
    expect(invoicePaper(145 * MM)).toBe("A5");
    expect(invoicePaper(146 * MM)).toBe("A4");
    expect(invoicePaper(400 * MM)).toBe("A4");
  });
});
