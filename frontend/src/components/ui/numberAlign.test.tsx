import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { NumberField } from "./NumberField";
import { TextField } from "./TextField";

describe("AC-UI-051 trường dữ liệu số luôn căn phải", () => {
  test("NumberField (giá, số lượng, VAT…) căn phải", () => {
    render(<NumberField label="Số lượng" value="1500" onChange={() => undefined} />);
    expect(screen.getByLabelText("Số lượng")).toHaveClass("text-right");
  });

  test("TextField ô số (inputMode numeric/decimal) căn phải; ô chữ và SĐT giữ căn trái", () => {
    render(
      <>
        <TextField label="Bảo hành (tháng)" inputMode="numeric" />
        <TextField label="Số giờ ước tính" inputMode="decimal" />
        <TextField label="Số điện thoại" inputMode="tel" />
        <TextField label="Tên khách hàng" />
      </>,
    );
    expect(screen.getByLabelText("Bảo hành (tháng)")).toHaveClass("text-right");
    expect(screen.getByLabelText("Số giờ ước tính")).toHaveClass("text-right");
    expect(screen.getByLabelText("Số điện thoại")).not.toHaveClass("text-right");
    expect(screen.getByLabelText("Tên khách hàng")).not.toHaveClass("text-right");
  });
});
