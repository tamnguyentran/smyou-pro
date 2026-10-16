import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_COLOR = /\[#[0-9a-fA-F]{3,8}\]|['"`]#[0-9a-fA-F]{3,8}['"`]/;
const FILES = [
  "features/orders/components/OrderDetailTabs.tsx",
  "features/orders/components/OrderInfoTab.tsx",
  "features/orders/components/OrderHistoryTab.tsx",
  "features/dispatch/components/OrderTasksTab.tsx",
  "features/orders/components/ConfirmationAttachmentsTab.tsx",
];

test("AC-UI-025 5 vị trí chi tiết đơn không thêm màu hex rời rạc (dùng token)", () => {
  for (const file of FILES) {
    const content = readFileSync(resolve(SRC, file), "utf-8");
    for (const line of content.split("\n")) {
      expect(line).not.toMatch(RAW_COLOR);
    }
  }
});
