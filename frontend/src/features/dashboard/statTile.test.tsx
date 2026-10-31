import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
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

test("StatTile không có `to`/`onClick`: không phải link/nút", () => {
  const { container } = render(<StatTile label="Quá hạn" value={3} tone="urgent" />);
  expect(container.querySelector("a")).toBeNull();
  expect(container.querySelector("button")).toBeNull();
  expect(container.firstElementChild?.tagName).toBe("DIV");
});

test("StatTile có `to` (khối ngoài M18-01a): vẫn là Link drill-down", () => {
  const { getByRole } = render(
    <MemoryRouter>
      <StatTile label="Chờ tiếp nhận" value={0} to="/dispatch/board?status=PENDING_ACCEPTANCE" />
    </MemoryRouter>,
  );
  expect(getByRole("link", { name: /Chờ tiếp nhận/ }).getAttribute("href")).toBe(
    "/dispatch/board?status=PENDING_ACCEPTANCE",
  );
});

test("AC-DASH-084 StatTile có `onClick`: là <button>, giữ layout, có viền focus-visible, aria-haspopup=dialog, ≥44px", async () => {
  const onClick = vi.fn();
  const { container, getByRole } = render(
    <StatTile label="Chờ điều phối" value={0} tone="urgent" onClick={onClick} />,
  );
  const button = getByRole("button", { name: /Chờ điều phối/ });
  expect(button.getAttribute("type")).toBe("button");
  expect(button.getAttribute("aria-haspopup")).toBe("dialog");
  expect(button.className).toContain("focus-visible:ring-2");
  expect(button.className).toContain("min-h-11");
  const tile = container.querySelector("button > div") as HTMLElement;
  expect(tile.className).toContain("rounded-2xl");
  expect(tile.className).toContain("p-5");

  button.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(onClick).toHaveBeenCalledTimes(1);
});
