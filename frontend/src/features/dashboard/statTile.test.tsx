import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { StatTile } from "./components/StatTile";

test("AC-UI-001 StatTile trung tính: nổi bằng shadow, không viền", () => {
  const { container } = render(<StatTile label="Tổng đơn" value={0} />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.className).toContain("shadow-card");
  expect(root.className).toContain("bg-card");
  expect(root.className).toContain("rounded-2xl");
  expect(root.className).toContain("p-5");
  expect(root.className).not.toMatch(/\bborder\b/);
});

test("AC-UI-002 StatTile tone=urgent value>0: vẫn giữ viền màu cảnh báo", () => {
  const { container } = render(<StatTile label="Quá hạn" value={3} tone="urgent" />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.className).toContain("border-urgent-border");
  expect(root.className).toContain("bg-urgent-bg");
});
