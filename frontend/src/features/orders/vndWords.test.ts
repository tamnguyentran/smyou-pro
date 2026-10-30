import { describe, expect, test } from "vitest";
import { vndToWords } from "./vndWords";

describe("AC-ORD-213 đổi số tiền VND thành chữ", () => {
  test.each([
    [550_000, "Năm trăm năm mươi ngàn đồng"],
    [1_250_000, "Một triệu hai trăm năm mươi ngàn đồng"],
    [1_005_000, "Một triệu không trăm lẻ năm ngàn đồng"],
    [0, "Không đồng"],
  ])("AC-ORD-213 %i → %s", (amount, words) => {
    expect(vndToWords(amount)).toBe(words);
  });

  test.each([
    [5, "Năm đồng"],
    [15, "Mười lăm đồng"],
    [21, "Hai mươi mốt đồng"],
    [24, "Hai mươi tư đồng"],
    [105, "Một trăm lẻ năm đồng"],
    [110, "Một trăm mười đồng"],
    [125, "Một trăm hai mươi lăm đồng"],
    [1_000_000, "Một triệu đồng"],
    [2_000_500, "Hai triệu năm trăm đồng"],
    [1_000_000_000, "Một tỷ đồng"],
    [3_000_050_000, "Ba tỷ không trăm năm mươi ngàn đồng"],
    [10_000, "Mười ngàn đồng"],
  ])("AC-ORD-213 %i → %s", (amount, words) => {
    expect(vndToWords(amount)).toBe(words);
  });
});
