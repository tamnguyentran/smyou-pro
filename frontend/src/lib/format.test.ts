import { describe, expect, test } from "vitest";
import { formatCurrency, formatDateTime, formatRelativeTime } from "./format";

describe("AC-SYS-072 formatDateTime: dd/MM/yyyy HH:mm, giờ Việt Nam (UI_GUIDELINES §6)", () => {
  test("đổi UTC sang Asia/Ho_Chi_Minh, đệm số 0, năm 4 chữ số, 24 giờ", () => {
    expect(formatDateTime("2026-09-19T18:05:00Z")).toBe("20/09/2026 01:05");
    expect(formatDateTime("2026-01-07T09:30:00Z")).toBe("07/01/2026 16:30");
  });
});

describe("AC-NTF-027 formatRelativeTime: thời gian tương đối tiếng Việt (notifications spec §6)", () => {
  const now = new Date("2026-10-09T10:00:00Z");

  test("vài giây → 'Vừa xong'", () => {
    expect(formatRelativeTime("2026-10-09T09:59:45Z", now)).toBe("Vừa xong");
  });

  test("vài phút trước → '5 phút trước'", () => {
    expect(formatRelativeTime("2026-10-09T09:55:00Z", now)).toBe("5 phút trước");
  });

  test("vài giờ trước → '2 giờ trước'", () => {
    expect(formatRelativeTime("2026-10-09T08:00:00Z", now)).toBe("2 giờ trước");
  });

  test("quá 7 ngày → về dạng tuyệt đối dd/MM/yyyy HH:mm", () => {
    expect(formatRelativeTime("2026-09-19T18:05:00Z", now)).toBe(
      formatDateTime("2026-09-19T18:05:00Z"),
    );
  });
});

describe("AC-CAT-012 formatCurrency: phân cách nghìn kiểu Việt Nam + ₫ (UI_GUIDELINES §6)", () => {
  test("số nguyên VND → dấu chấm phân cách nghìn, có ký hiệu ₫", () => {
    expect(formatCurrency(12_500_000)).toBe("12.500.000 ₫");
    expect(formatCurrency(0)).toBe("0 ₫");
    expect(formatCurrency(950_000)).toBe("950.000 ₫");
  });
});
