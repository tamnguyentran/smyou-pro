import { describe, expect, test } from "vitest";
import { resolveBasePath } from "./basePath";

describe("resolveBasePath", () => {
  test.each([undefined, "", "/", "  "])("AC-SYS-013 %j → gốc", (raw) => {
    expect(resolveBasePath(raw)).toEqual({ viteBase: "/", routerBasename: "/", apiPrefix: "" });
  });

  test.each(["smyoutask", "/smyoutask", "/smyoutask/", " /smyoutask// "])(
    "AC-SYS-013 %j → /smyoutask",
    (raw) => {
      expect(resolveBasePath(raw)).toEqual({
        viteBase: "/smyoutask/",
        routerBasename: "/smyoutask",
        apiPrefix: "/smyoutask",
      });
    },
  );

  test("AC-SYS-013 giữ nhiều cấp và ký tự - _", () => {
    expect(resolveBasePath("/apps/smyou_task-2")).toEqual({
      viteBase: "/apps/smyou_task-2/",
      routerBasename: "/apps/smyou_task-2",
      apiPrefix: "/apps/smyou_task-2",
    });
  });

  test.each([
    "/a b",
    "/../x",
    "/smyou/./task",
    "https://x",
    "//evil.example",
    "/a?b",
    "/a#b",
    "/đơn",
  ])("AC-SYS-013 %j không hợp lệ → ném lỗi", (raw) => {
    expect(() => resolveBasePath(raw)).toThrow(/BASE_PATH/);
  });
});
