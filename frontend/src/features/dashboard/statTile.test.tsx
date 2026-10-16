import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

test("AC-DASH-028 StatTile không có prop `to`: không phải link", () => {
  const { container } = render(<StatTile label="Quá hạn" value={3} tone="urgent" />);
  expect(container.querySelector("a")).toBeNull();
  expect(container.firstElementChild?.tagName).toBe("DIV");
});

test("AC-DASH-022/030 StatTile có prop `to`: bọc bằng Link, giữ nguyên layout, có viền focus-visible", () => {
  const { container, getByRole } = render(
    <MemoryRouter>
      <StatTile label="Chờ điều phối" value={3} to="/orders?status=PENDING_DISPATCH&mine=1" />
    </MemoryRouter>,
  );
  const link = getByRole("link", { name: /Chờ điều phối/ });
  expect(link.getAttribute("href")).toBe("/orders?status=PENDING_DISPATCH&mine=1");
  expect(link.className).toContain("focus-visible:ring-2");
  const tile = container.querySelector("a > div") as HTMLElement;
  expect(tile).not.toBeNull();
  expect(tile.className).toContain("rounded-2xl");
  expect(tile.className).toContain("p-5");
});

test("AC-DASH-026 StatTile có `to` nhưng value=0: vẫn là link bấm được", () => {
  const { getByRole } = render(
    <MemoryRouter>
      <StatTile label="Nháp" value={0} to="/orders?status=DRAFT&mine=1" />
    </MemoryRouter>,
  );
  expect(getByRole("link", { name: /Nháp/ }).getAttribute("href")).toBe(
    "/orders?status=DRAFT&mine=1",
  );
});
