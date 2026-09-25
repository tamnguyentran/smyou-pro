import { expect, test } from "vitest";
import { cn } from "./cn";

test("cn bỏ giá trị rỗng và để utility sau thắng", () => {
  expect(cn("px-2 text-body", false, undefined, "px-4")).toBe("text-body px-4");
});
