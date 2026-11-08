import { describe, expect, test } from "vitest";
import { defaultDueAt } from "./dueDefault";

// M28-02: hạn mặc định theo giờ làm Thứ 2–Thứ 7, 08–12 + 13–17 (giờ VN), bắt đầu làm tròn lên 15'.
// Thứ 2 = 2026-11-09, Thứ 7 = 2026-11-14, Chủ nhật = 2026-11-15.
const vn = (local: string) => new Date(`${local}:00+07:00`);

describe("defaultDueAt", () => {
  test.each([
    ["2026-11-09T09:00", 2, "2026-11-09T11:00"],
    ["2026-11-09T15:00", 2, "2026-11-09T17:00"],
  ])("AC-DSP-138 %s + %sh → %s (trong cùng khung, kết thúc đúng 17:00)", (now, hours, due) => {
    expect(defaultDueAt(vn(now), hours)).toBe(due);
  });

  test("AC-DSP-139 10:37 + 2h → bắt đầu 10:45, qua nghỉ trưa → 13:45", () => {
    expect(defaultDueAt(vn("2026-11-09T10:37"), 2)).toBe("2026-11-09T13:45");
  });

  test("AC-DSP-139 kết thúc đúng 12:00 thì hạn là 12:00 (không đẩy qua 13:00)", () => {
    expect(defaultDueAt(vn("2026-11-09T10:00"), 2)).toBe("2026-11-09T12:00");
  });

  test.each([
    ["2026-11-09T15:00", 4, "2026-11-10T10:00"],
    ["2026-11-09T08:00", 20, "2026-11-11T12:00"],
  ])("AC-DSP-140 %s + %sh → %s (tràn sang ngày làm việc sau)", (now, hours, due) => {
    expect(defaultDueAt(vn(now), hours)).toBe(due);
  });

  test.each([
    ["2026-11-14T16:00", 3, "2026-11-16T10:00"],
    ["2026-11-15T10:00", 1, "2026-11-16T09:00"],
  ])("AC-DSP-141 %s + %sh → %s (bỏ Chủ nhật)", (now, hours, due) => {
    expect(defaultDueAt(vn(now), hours)).toBe(due);
  });

  test.each([
    ["2026-11-09T06:30", 1, "2026-11-09T09:00"],
    ["2026-11-09T12:20", 1, "2026-11-09T14:00"],
    ["2026-11-09T18:00", 1, "2026-11-10T09:00"],
    ["2026-11-09T16:50", 0.25, "2026-11-10T08:15"],
  ])("AC-DSP-142 ngoài giờ %s + %sh → %s (bắt đầu từ khung làm việc kế)", (now, hours, due) => {
    expect(defaultDueAt(vn(now), hours)).toBe(due);
  });

  test("AC-DSP-142 không phụ thuộc múi giờ máy: 23:30 UTC Chủ nhật = 06:30 Thứ 2 giờ VN", () => {
    expect(defaultDueAt(new Date("2026-11-08T23:30:00Z"), 1)).toBe("2026-11-09T09:00");
  });
});
