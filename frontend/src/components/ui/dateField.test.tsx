import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DateField, type DateFieldProps } from "./DateField";
import { Sheet } from "./Sheet";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 04/11/2026 10:00 giờ VN.
  vi.setSystemTime(new Date("2026-11-04T03:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Controlled like the real callers: keeps whatever `onChange` reports as the new `value`. */
function Controlled(
  props: Omit<DateFieldProps, "value" | "onChange"> & {
    initial?: string;
    spy: (v: string) => void;
  },
) {
  const { initial = "", spy, ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <DateField
      {...rest}
      value={value}
      onChange={(next) => {
        spy(next);
        setValue(next);
      }}
    />
  );
}

describe("DateField mode month", () => {
  test("AC-UI-079 hiển thị MM/yyyy, nhãn, placeholder khi trống", () => {
    render(
      <>
        <DateField mode="month" label="Tháng" value="2026-11" onChange={() => undefined} />
        <DateField mode="month" label="Tháng trống" value="" onChange={() => undefined} />
      </>,
    );
    expect(screen.getByLabelText("Tháng")).toHaveValue("11/2026");
    expect(screen.getByLabelText("Tháng trống")).toHaveValue("");
    expect(screen.getByLabelText("Tháng trống")).toHaveAttribute("placeholder", "MM/yyyy");
    expect(screen.getByLabelText("Tháng")).toHaveAttribute("inputmode", "numeric");
    expect(screen.queryByRole("textbox", { name: "Tháng" })).not.toHaveAttribute("type", "month");
  });

  test("AC-UI-080 gõ 112026 → tự chèn '/', onChange('2026-11'); gõ dở 11 → onChange('')", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="month" label="Tháng" spy={spy} />);
    const input = screen.getByLabelText("Tháng");
    await user.type(input, "11");
    expect(spy).toHaveBeenLastCalledWith("");
    await user.type(input, "2026");
    expect(input).toHaveValue("11/2026");
    expect(spy).toHaveBeenLastCalledWith("2026-11");
  });

  test("AC-UI-081 13/2026 + blur → lỗi, aria-invalid, onChange(''), giữ chữ đã gõ", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="month" label="Tháng" spy={spy} />);
    const input = screen.getByLabelText("Tháng");
    await user.type(input, "13/2026");
    await user.tab();
    expect(screen.getByText("Tháng không hợp lệ (MM/yyyy).")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(spy).toHaveBeenLastCalledWith("");
    expect(input).toHaveValue("13/2026");
  });

  test("AC-UI-082 nút lịch mở bảng chọn tháng: Năm 2026, Th1…Th12, Th11 được chọn", async () => {
    const user = userEvent.setup();
    render(<DateField mode="month" label="Tháng" value="2026-11" onChange={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Chọn tháng" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn tháng" });
    expect(within(dialog).getByText("Năm 2026")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Năm trước" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Năm sau" })).toBeInTheDocument();
    const months = Array.from({ length: 12 }, (_, i) => `Th${String(i + 1)}`);
    for (const name of months) {
      expect(within(dialog).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(dialog).getByRole("button", { name: "Th11" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(dialog).getByRole("button", { name: "Th10" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("AC-UI-083 Năm sau → Th1: đóng bảng, 01/2027, onChange('2027-01'), focus về nút lịch", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="month" label="Tháng" initial="2026-11" spy={spy} />);
    const trigger = screen.getByRole("button", { name: "Chọn tháng" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Chọn tháng" });
    await user.click(within(dialog).getByRole("button", { name: "Năm sau" }));
    expect(within(dialog).getByText("Năm 2027")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Th1" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Tháng")).toHaveValue("01/2027");
    expect(spy).toHaveBeenLastCalledWith("2027-01");
    expect(trigger).toHaveFocus();
  });

  test("AC-UI-084 Esc hoặc bấm ra ngoài → đóng, không gọi onChange", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Controlled mode="month" label="Tháng" initial="2026-11" spy={spy} />
        <p>Ngoài</p>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Chọn tháng" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Chọn tháng" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByText("Ngoài"));
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(screen.getByLabelText("Tháng")).toHaveValue("11/2026");
    expect(spy).not.toHaveBeenCalled();
  });

  test("AC-UI-094 mở bảng chọn → focus vào ô đang chọn; trống → ô hôm nay; aria-current tháng này", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Controlled mode="month" label="Tháng" initial="2026-03" spy={vi.fn()} />
        <Controlled mode="month" label="Tháng trống" spy={vi.fn()} />
      </>,
    );
    const [withValue, empty] = screen.getAllByRole("button", { name: "Chọn tháng" });
    if (!withValue || !empty) throw new Error("expected two month pickers");
    await user.click(withValue);
    expect(screen.getByRole("button", { name: "Th3" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Th11" })).toHaveAttribute("aria-current", "date");
    expect(screen.getByRole("button", { name: "Th3" })).not.toHaveAttribute("aria-current");
    await user.keyboard("{Escape}");
    expect(withValue).toHaveFocus();

    await user.click(empty);
    expect(screen.getByRole("button", { name: "Th11" })).toHaveFocus();
  });

  test("AC-UI-094 lịch ngày: focus ngày đang chọn; gõ dở → focus ô hôm nay", async () => {
    const user = userEvent.setup();
    render(<Controlled mode="date" label="Từ ngày" initial="2026-10-20" spy={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    expect(screen.getByRole("button", { name: "20" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await user.clear(screen.getByLabelText("Từ ngày"));
    await user.type(screen.getByLabelText("Từ ngày"), "0101202");
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    expect(screen.getByText("Tháng 11/2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4" })).toHaveFocus();
  });

  test("AC-UI-084 AC-UI-094 Esc trong Sheet chỉ đóng bảng chọn, không đóng Sheet", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Sheet open onClose={onClose} title="Sửa" footer={<button>OK</button>}>
        <Controlled mode="month" label="Tháng" initial="2026-11" spy={vi.fn()} />
      </Sheet>,
    );
    await user.click(screen.getByRole("button", { name: "Chọn tháng" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Chọn tháng" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("DateField mode date", () => {
  test("AC-UI-085 04/11/2026; lịch Tháng 11/2026, T2…CN, ngày 1 ở cột CN, ngày 4 chọn, hôm nay có viền", async () => {
    const user = userEvent.setup();
    render(<DateField mode="date" label="Từ ngày" value="2026-11-04" onChange={() => undefined} />);
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("04/11/2026");
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    expect(within(dialog).getByText("Tháng 11/2026")).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
    const firstWeek = within(dialog).getAllByRole("row")[1];
    if (!firstWeek) throw new Error("no first week row");
    const cells = within(firstWeek).getAllByRole("cell");
    expect(cells).toHaveLength(7);
    expect(cells[6]).toHaveTextContent("1");
    expect(cells.slice(0, 6).every((cell) => cell.textContent === "")).toBe(true);

    const four = within(dialog).getByRole("button", { name: "4" });
    expect(four).toHaveAttribute("aria-pressed", "true");
    expect(four).toHaveAttribute("aria-current", "date");
    expect(four.className).toMatch(/\bborder\b/);
    expect(within(dialog).getByRole("button", { name: "5" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("AC-UI-085 hôm nay có viền cả khi không phải ngày đang chọn", async () => {
    const user = userEvent.setup();
    render(<DateField mode="date" label="Từ ngày" value="2026-11-10" onChange={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    const today = within(dialog).getByRole("button", { name: "4" });
    expect(today).toHaveAttribute("aria-current", "date");
    expect(today).toHaveAttribute("aria-pressed", "false");
    expect(today.className).toMatch(/\bborder\b/);
    expect(within(dialog).getByRole("button", { name: "5" })).not.toHaveAttribute("aria-current");
  });

  test("AC-UI-086 gõ 04112026 → 04/11/2026; 29022025 + blur → lỗi (2025 không nhuận)", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="date" label="Từ ngày" spy={spy} />);
    const input = screen.getByLabelText("Từ ngày");
    await user.type(input, "04112026");
    expect(input).toHaveValue("04/11/2026");
    expect(spy).toHaveBeenLastCalledWith("2026-11-04");

    await user.clear(input);
    await user.type(input, "29022025");
    await user.tab();
    expect(input).toHaveValue("29/02/2025");
    expect(screen.getByText("Ngày không hợp lệ (dd/MM/yyyy).")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(spy).toHaveBeenLastCalledWith("");
  });

  test("AC-UI-087 Tháng trước → chọn 31 → 31/10/2026", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="date" label="Từ ngày" initial="2026-11-04" spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    await user.click(within(dialog).getByRole("button", { name: "Tháng trước" }));
    expect(within(dialog).getByText("Tháng 10/2026")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "31" }));
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("31/10/2026");
    expect(spy).toHaveBeenLastCalledWith("2026-10-31");
  });
});

describe("DateField mode datetime", () => {
  test("AC-UI-088 gõ 041120261430 → 04/11/2026 14:30, onChange('2026-11-04T14:30')", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="datetime" label="Bắt đầu" spy={spy} />);
    const input = screen.getByLabelText("Bắt đầu");
    expect(input).toHaveAttribute("placeholder", "dd/MM/yyyy HH:mm");
    await user.type(input, "041120261430");
    expect(input).toHaveValue("04/11/2026 14:30");
    expect(spy).toHaveBeenLastCalledWith("2026-11-04T14:30");
  });

  test("AC-UI-088 withSeconds: 04112026143005 → 04/11/2026 14:30:05", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="datetime" withSeconds label="Bắt đầu" spy={spy} />);
    const input = screen.getByLabelText("Bắt đầu");
    expect(input).toHaveAttribute("placeholder", "dd/MM/yyyy HH:mm:ss");
    await user.type(input, "04112026143005");
    expect(input).toHaveValue("04/11/2026 14:30:05");
    expect(spy).toHaveBeenLastCalledWith("2026-11-04T14:30:05");
  });

  test("AC-UI-088 giờ 25:00 + blur → lỗi ngày giờ", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="datetime" label="Bắt đầu" spy={spy} />);
    const input = screen.getByLabelText("Bắt đầu");
    await user.type(input, "041120262500");
    await user.tab();
    expect(input).toHaveValue("04/11/2026 25:00");
    expect(screen.getByText("Ngày giờ không hợp lệ (dd/MM/yyyy HH:mm).")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(spy).toHaveBeenLastCalledWith("");
  });

  test("AC-UI-089 chọn ngày 05 trên lịch giữ nguyên giờ 14:30", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="datetime" label="Bắt đầu" initial="2026-11-04T14:30" spy={spy} />);
    expect(screen.getByLabelText("Bắt đầu")).toHaveValue("04/11/2026 14:30");
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    await user.click(within(dialog).getByRole("button", { name: "5" }));
    expect(screen.getByLabelText("Bắt đầu")).toHaveValue("05/11/2026 14:30");
    expect(spy).toHaveBeenLastCalledWith("2026-11-05T14:30");
  });

  test("AC-UI-108 ô trống, chọn ngày 05 trên lịch → điền giờ 17:00", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="datetime" label="Hạn hoàn thành" spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    await user.click(within(dialog).getByRole("button", { name: "5" }));
    expect(screen.getByLabelText("Hạn hoàn thành")).toHaveValue("05/11/2026 17:00");
    expect(spy).toHaveBeenLastCalledWith("2026-11-05T17:00");
  });

  test("AC-UI-110 lịch có chọn giờ/phút: chọn ngày 05, Giờ 09, Phút 30 → 05/11/2026 09:30; Xong đóng lịch", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="datetime" label="Hạn hoàn thành" spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    await user.click(within(dialog).getByRole("button", { name: "5" }));
    expect(screen.getByRole("dialog", { name: "Chọn ngày" })).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Giờ"), "09");
    await user.selectOptions(within(dialog).getByLabelText("Phút"), "30");
    expect(screen.getByLabelText("Hạn hoàn thành")).toHaveValue("05/11/2026 09:30");
    expect(spy).toHaveBeenLastCalledWith("2026-11-05T09:30");
    await user.click(within(dialog).getByRole("button", { name: "Xong" }));
    expect(screen.queryByRole("dialog", { name: "Chọn ngày" })).not.toBeInTheDocument();
  });

  test("AC-UI-111 ô trống, chọn Giờ 08 trước khi chọn ngày → ngày hôm nay 08:00; ô giờ hiện giờ đã có", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="datetime" label="Hạn hoàn thành" spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    expect(within(dialog).getByLabelText("Giờ")).toHaveValue("17");
    expect(within(dialog).getByLabelText("Phút")).toHaveValue("00");
    await user.selectOptions(within(dialog).getByLabelText("Giờ"), "08");
    expect(screen.getByLabelText("Hạn hoàn thành")).toHaveValue("04/11/2026 08:00");
    expect(spy).toHaveBeenLastCalledWith("2026-11-04T08:00");
  });

  test("AC-UI-111 giờ đã gõ 14:37 (lẻ) → ô Phút có 37 và giữ nguyên", async () => {
    const user = userEvent.setup();
    render(
      <Controlled
        mode="datetime"
        label="Hạn hoàn thành"
        initial="2026-11-04T14:37"
        spy={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    expect(within(dialog).getByLabelText("Giờ")).toHaveValue("14");
    expect(within(dialog).getByLabelText("Phút")).toHaveValue("37");
  });

  test("AC-UI-109 giờ gõ chưa đủ (0411202614), chọn ngày 05 → giờ 17:00", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="datetime" label="Hạn hoàn thành" spy={spy} />);
    await user.type(screen.getByLabelText("Hạn hoàn thành"), "0411202614");
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    await user.click(within(dialog).getByRole("button", { name: "5" }));
    expect(screen.getByLabelText("Hạn hoàn thành")).toHaveValue("05/11/2026 17:00");
    expect(spy).toHaveBeenLastCalledWith("2026-11-05T17:00");
  });
});

describe("DateField lỗi/gợi ý/disabled/kích thước", () => {
  test("AC-UI-090 error + hint như TextField (aria-describedby), error prop ưu tiên hơn lỗi định dạng", async () => {
    const user = userEvent.setup();
    render(
      <DateField
        mode="month"
        label="Tháng"
        value=""
        onChange={() => undefined}
        hint="Gợi ý tháng"
        error="Bắt buộc chọn tháng."
      />,
    );
    const input = screen.getByLabelText("Tháng");
    const hint = screen.getByText("Gợi ý tháng");
    const error = screen.getByText("Bắt buộc chọn tháng.");
    expect(hint).toHaveClass("text-xs", "font-medium", "text-muted");
    expect(error).toHaveClass("text-xs", "font-medium", "text-urgent-fg");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toEqual(
      expect.arrayContaining([hint.id, error.id]),
    );
    expect(input).toHaveAttribute("aria-invalid", "true");

    await user.type(input, "13/2026");
    await user.tab();
    expect(screen.getByText("Bắt buộc chọn tháng.")).toBeInTheDocument();
    expect(screen.queryByText("Tháng không hợp lệ (MM/yyyy).")).toBeNull();
  });

  test("AC-UI-090 disabled khoá ô và nút lịch", () => {
    render(
      <DateField
        mode="date"
        label="Từ ngày"
        value="2026-11-04"
        onChange={() => undefined}
        disabled
      />,
    );
    expect(screen.getByLabelText("Từ ngày")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Chọn ngày" })).toBeDisabled();
  });

  test("AC-UI-090 ô + nút lịch cao ≥ 44px; ô trong bảng chọn ≥ 44×44px", async () => {
    const user = userEvent.setup();
    render(
      <>
        <DateField mode="month" label="Tháng" value="2026-11" onChange={() => undefined} />
        <DateField mode="date" label="Từ ngày" value="2026-11-04" onChange={() => undefined} />
      </>,
    );
    expect(screen.getByLabelText("Tháng")).toHaveClass("h-11");
    const monthTrigger = screen.getByRole("button", { name: "Chọn tháng" });
    expect(monthTrigger).toHaveClass("h-11", "w-11");
    await user.click(monthTrigger);
    const monthDialog = screen.getByRole("dialog", { name: "Chọn tháng" });
    for (const button of within(monthDialog).getAllByRole("button")) {
      expect(button).toHaveClass("min-h-11", "min-w-11");
    }
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dayDialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    for (const button of within(dayDialog).getAllByRole("button")) {
      expect(button).toHaveClass("min-h-11", "min-w-11");
    }
  });
});

describe("DateField ca biên", () => {
  test("AC-UI-080 xoá trống → onChange(''); gõ quá số chữ số → bỏ phần thừa", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="month" label="Tháng" initial="2026-11" spy={spy} />);
    const input = screen.getByLabelText("Tháng");
    await user.clear(input);
    expect(input).toHaveValue("");
    expect(spy).toHaveBeenLastCalledWith("");
    await user.type(input, "1120269");
    expect(input).toHaveValue("11/2026");
    expect(spy).toHaveBeenLastCalledWith("2026-11");
  });

  test("AC-UI-086 29/02/2024 (năm nhuận) hợp lệ", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="date" label="Từ ngày" spy={spy} />);
    const input = screen.getByLabelText("Từ ngày");
    await user.type(input, "29022024");
    await user.tab();
    expect(input).toHaveValue("29/02/2024");
    expect(spy).toHaveBeenLastCalledWith("2024-02-29");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  test("AC-UI-088 withSeconds: giây 60 + blur → lỗi", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="datetime" withSeconds label="Bắt đầu" spy={spy} />);
    const input = screen.getByLabelText("Bắt đầu");
    await user.type(input, "04112026143060");
    await user.tab();
    expect(input).toHaveValue("04/11/2026 14:30:60");
    expect(screen.getByText("Ngày giờ không hợp lệ (dd/MM/yyyy HH:mm:ss).")).toBeInTheDocument();
    expect(spy).toHaveBeenLastCalledWith("");
  });

  test("AC-UI-079 value đổi từ ngoài sau khi render → ô hiện giá trị mới", () => {
    const { rerender } = render(
      <DateField mode="month" label="Tháng" value="2026-11" onChange={() => undefined} />,
    );
    rerender(<DateField mode="month" label="Tháng" value="2027-02" onChange={() => undefined} />);
    expect(screen.getByLabelText("Tháng")).toHaveValue("02/2027");
    rerender(<DateField mode="month" label="Tháng" value="" onChange={() => undefined} />);
    expect(screen.getByLabelText("Tháng")).toHaveValue("");
  });
});

describe("DateField min/max (M21-06b)", () => {
  test("AC-UI-095 max=2026-11-04: ngày 05…30/11 bị khoá, ngày 04 chọn được, nút Tháng sau bị khoá", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="date" label="Ngày sinh" max="2026-11-04" spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    expect(within(dialog).getByText("Tháng 11/2026")).toBeInTheDocument();
    for (const day of [5, 6, 15, 30]) {
      expect(within(dialog).getByRole("button", { name: String(day) })).toBeDisabled();
    }
    expect(within(dialog).getByRole("button", { name: "Tháng sau" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Tháng trước" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "5" }));
    expect(spy).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "4" }));
    expect(screen.getByLabelText("Ngày sinh")).toHaveValue("04/11/2026");
    expect(spy).toHaveBeenLastCalledWith("2026-11-04");
  });

  test("AC-UI-095 min=2026-01-01: Tháng 01/2026 khoá nút Tháng trước, ngày 1 chọn được", async () => {
    const user = userEvent.setup();
    render(
      <DateField
        mode="date"
        label="Từ ngày"
        value="2026-01-10"
        min="2026-01-01"
        onChange={() => undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chọn ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn ngày" });
    expect(within(dialog).getByRole("button", { name: "Tháng trước" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "1" })).toBeEnabled();
  });

  test("AC-UI-096 gõ ngày sau max → lỗi 'Ngày không được sau 04/11/2026.', onChange('')", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="date" label="Ngày sinh" max="2026-11-04" spy={spy} />);
    const input = screen.getByLabelText("Ngày sinh");
    await user.type(input, "05112026");
    expect(spy).toHaveBeenLastCalledWith("");
    await user.tab();
    expect(input).toHaveValue("05/11/2026");
    expect(screen.getByText("Ngày không được sau 04/11/2026.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");

    await user.clear(input);
    await user.type(input, "04112026");
    await user.tab();
    expect(spy).toHaveBeenLastCalledWith("2026-11-04");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  test("AC-UI-096 gõ ngày trước min → lỗi 'Ngày không được trước 01/01/2026.', onChange('')", async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Controlled mode="date" label="Từ ngày" min="2026-01-01" spy={spy} />);
    const input = screen.getByLabelText("Từ ngày");
    await user.type(input, "31122025");
    await user.tab();
    expect(spy).toHaveBeenLastCalledWith("");
    expect(screen.getByText("Ngày không được trước 01/01/2026.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
