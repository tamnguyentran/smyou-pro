import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HomePage } from "./HomePage";

test("HomePage hiển thị tên ứng dụng và mô tả", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { level: 1, name: "SMYou Pro" })).toBeInTheDocument();
  expect(screen.getByText("Quản lý đơn hàng và đầu việc kỹ thuật")).toBeInTheDocument();
});
