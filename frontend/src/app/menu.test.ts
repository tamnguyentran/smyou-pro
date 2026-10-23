import { describe, expect, test } from "vitest";
import { MENU, visibleMenu } from "./menu";

describe("visibleMenu — nhóm cha không có capability riêng", () => {
  test("AC-RPT-054 không có capability nào thì nhóm Báo cáo không hiện", () => {
    const visible = visibleMenu({}, MENU);
    expect(visible.find((item) => item.id === "reports")).toBeUndefined();
  });
});
