import { describe, expect, test } from "vitest";
import matrix from "./permissionMatrix.json";
import { MANAGER_BUNDLE } from "./schemas";
import { widestScope } from "./permissionScope";

describe("AC-EMP-089 Quản lý chung = hợp quyền vai trò tự kèm", () => {
  test("AC-EMP-089 bộ vai trò tự kèm lấy từ máy chủ (permissionMatrix.json)", () => {
    expect([...MANAGER_BUNDLE]).toEqual(matrix.manager_bundle);
  });

  test("AC-EMP-089 nhiều vai trò cùng có quyền → lấy phạm vi rộng nhất", () => {
    expect(widestScope({ SALE: "own", TECH_LEAD: "all" }, "MANAGER")).toBe("all");
    expect(widestScope({ CUSTOMER_CARE: "assigned", SALE: "own" }, "MANAGER")).toBe("own");
    expect(widestScope({ MANAGER: "self", TECH_LEAD: "all" }, "MANAGER")).toBe("all");
  });

  test("AC-EMP-089 vai trò khác không được cộng quyền tự kèm", () => {
    expect(widestScope({ TECH_LEAD: "all" }, "SALE")).toBeUndefined();
    expect(widestScope({ TECH_LEAD: "all", TECHNICIAN: "assigned" }, "TECHNICIAN")).toBe(
      "assigned",
    );
    expect(widestScope({ TECHNICIAN: "self" }, "MANAGER")).toBeUndefined();
  });
});
