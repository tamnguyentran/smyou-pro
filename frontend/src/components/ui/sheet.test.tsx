import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { Sheet } from "./Sheet";

const longBody = Array.from({ length: 40 }, (_, i) => <p key={i}>Dòng nội dung {i + 1}</p>);

describe("Sheet: header + footer ngoài vùng cuộn (M4-01d)", () => {
  test("AC-SYS-082 header → body → footer, chỉ body cuộn", () => {
    render(
      <Sheet open onClose={vi.fn()} title="Tạo đầu việc" footer={<button>Lưu</button>}>
        {longBody}
      </Sheet>,
    );
    const panel = screen.getByTestId("sheet-panel");
    const header = screen.getByTestId("sheet-header");
    const body = screen.getByTestId("sheet-body");
    const footer = screen.getByTestId("sheet-footer");
    expect(Array.from(panel.children)).toEqual([header, body, footer]);
    expect(body.className).toMatch(/overflow-y-auto/);
    expect(panel.className).not.toMatch(/overflow-y-auto/);
    expect(panel.className).toMatch(/flex-col/);
    expect(header).toContainElement(screen.getByRole("heading", { name: "Tạo đầu việc" }));
    expect(header).toContainElement(screen.getByRole("button", { name: "Đóng hộp thoại" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "Lưu" }));
    expect(body).toHaveTextContent("Dòng nội dung 40");
  });

  test("AC-SYS-085 không có footer thì không render vùng footer", () => {
    render(
      <Sheet open onClose={vi.fn()} title="Mật khẩu tạm">
        <p>Nội dung ngắn</p>
      </Sheet>,
    );
    expect(screen.queryByTestId("sheet-footer")).toBeNull();
    expect(screen.getByTestId("sheet-body")).toHaveTextContent("Nội dung ngắn");
  });

  test("AC-SYS-086 nút trong footer submit form nằm trong body", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <Sheet
        open
        onClose={vi.fn()}
        title="Sửa liên hệ"
        footer={
          <button type="submit" form="f">
            Lưu
          </button>
        }
      >
        <form id="f" onSubmit={onSubmit}>
          <input aria-label="Tên" />
        </form>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByLabelText("Tên"), "An{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  test("AC-SYS-087 dismissible=false chặn Esc/overlay/✕; true thì đóng được", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet
        open
        onClose={onClose}
        title="Huỷ đơn"
        dismissible={false}
        footer={<button>OK</button>}
      >
        <p>x</p>
      </Sheet>,
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByTestId("sheet-overlay"));
    expect(screen.getByRole("button", { name: "Đóng hộp thoại" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <Sheet open onClose={onClose} title="Huỷ đơn" footer={<button>OK</button>}>
        <p>x</p>
      </Sheet>,
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByTestId("sheet-overlay"));
    await userEvent.click(screen.getByRole("button", { name: "Đóng hộp thoại" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test("AC-SYS-088 focus trap xoay vòng qua footer và trả focus khi đóng", async () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>Mở</button>
          <Sheet
            open={open}
            onClose={vi.fn()}
            title="Form"
            footer={
              <>
                <button>Đóng</button>
                <button>Lưu</button>
              </>
            }
          >
            <input aria-label="a" />
            <input aria-label="b" />
            <input aria-label="c" />
          </Sheet>
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    screen.getByRole("button", { name: "Mở" }).focus();
    rerender(<Harness open />);
    const close = screen.getByRole("button", { name: "Đóng hộp thoại" });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Lưu" })).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    for (let i = 0; i < 4; i++) await userEvent.tab();
    expect(screen.getByRole("button", { name: "Đóng" })).toHaveFocus();
    rerender(<Harness open={false} />);
    expect(screen.getByRole("button", { name: "Mở" })).toHaveFocus();
  });

  test("AC-SYS-091 ConfirmDialog: hai nút nằm trong footer, căn phải, ≥ 44px; loading khoá đóng", () => {
    const { rerender } = render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        title="Huỷ đơn?"
        message="Huỷ đơn DH2609-0001?"
        confirmLabel="Xác nhận"
        onConfirm={vi.fn()}
      />,
    );
    const footer = screen.getByTestId("sheet-footer");
    expect(footer).toContainElement(screen.getByRole("button", { name: "Huỷ" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "Xác nhận" }));
    expect(footer.innerHTML).toMatch(/justify-end/);
    expect(screen.getByTestId("sheet-body")).toHaveTextContent("Huỷ đơn DH2609-0001?");
    rerender(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        title="Huỷ đơn?"
        message="Huỷ đơn DH2609-0001?"
        confirmLabel="Xác nhận"
        onConfirm={vi.fn()}
        loading
      />,
    );
    expect(screen.getByRole("button", { name: "Đóng hộp thoại" })).toBeDisabled();
  });

  test("AC-SYS-092 footer chừa safe-area và panel không vượt 85% viewport", () => {
    render(
      <Sheet open onClose={vi.fn()} title="Form" footer={<button>Lưu</button>}>
        <p>x</p>
      </Sheet>,
    );
    expect(screen.getByTestId("sheet-footer").className).toMatch(/safe-area-inset-bottom/);
    expect(screen.getByTestId("sheet-panel").className).toMatch(/max-h-\[85vh\]/);
  });
});

describe("Sheet: mọi màn dùng chung (M4-01d)", () => {
  const dir = resolve(import.meta.dirname, "../..");
  const screens = [
    "features/customers/components/CustomerFormSheet.tsx",
    "features/products/components/ProductFormSheet.tsx",
    "features/services/components/ServiceFormSheet.tsx",
    "features/employees/components/EmployeeFormSheet.tsx",
    "features/dispatch/components/TaskCreateSheet.tsx",
    "features/orders/components/AddLineSheet.tsx",
    "features/orders/components/EditContactSheet.tsx",
    "features/orders/components/CancelOrderSheet.tsx",
    "features/employees/components/TemporaryPasswordDialog.tsx",
  ];

  test("AC-SYS-090 màn có hàng nút đều đưa nút sang prop footer, không để submit trong body", () => {
    for (const file of screens) {
      const source = readFileSync(resolve(dir, file), "utf8");
      expect(source, file).toMatch(/footer=/);
      // Nút submit nằm trong footer phải trỏ về form bằng thuộc tính `form`.
      if (/type="submit"/.test(source)) expect(source, file).toMatch(/form=\{?["A-Za-z]/);
    }
    // CatalogImportSheet có nhiều bước; chỉ cần dùng footer cho hàng nút.
    expect(
      readFileSync(resolve(dir, "features/catalogImport/CatalogImportSheet.tsx"), "utf8"),
    ).toMatch(/footer=/);
  });
});
