import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ORDER_STATUS_LABEL } from "../orders/orderStatus";
import { markSignedIn } from "../../lib/sessionHint";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";
import { GUIDES } from "./content";

const hongId = "a0000000-0000-4000-8000-000000000031";
const haId = "a0000000-0000-4000-8000-000000000032";
const namId = "a0000000-0000-4000-8000-000000000033";
const all = ["all"];

const HONG: Person = {
  code: "NV031",
  full_name: "Lê Thị Hồng",
  email: "hong.le@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": all, "order.read": all, "order.create": all },
};
const HA: Person = {
  code: "NV032",
  full_name: "Phạm Thu Hà",
  email: "ha.pham@smyou.vn",
  roles: ["SALE", "TECHNICIAN"],
  capabilities: { "dashboard.read": all, "order.read": all, "assignment.respond": ["self"] },
};
const NAM: Person = {
  code: "NV033",
  full_name: "Nguyễn Văn Nam",
  email: "nam.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: { "dashboard.read": all, "order.read": all, "employee.manage": all },
};
const ALL_TABS = [
  "Quản lý chung",
  "Nhân viên kinh doanh",
  "Chăm sóc khách hàng",
  "Quản lý kỹ thuật",
  "Nhân viên kỹ thuật",
];

function mockViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function openAs(id: string, person: Person, path = "/huong-dan") {
  signedInAs(id, person);
  markSignedIn();
  return renderApp(path);
}

async function guideRegion(label: string) {
  return screen.findByRole("region", { name: `Hướng dẫn ${label}` });
}

function sectionTitles(region: HTMLElement) {
  return within(region)
    .getAllByRole("heading", { level: 2 })
    .map((h) => h.textContent);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AC-HELP-001 nút ? trên đầu trang", () => {
  for (const desktop of [true, false]) {
    test(`AC-HELP-001 header ${desktop ? "desktop" : "điện thoại"} có nút Hướng dẫn sử dụng ≥44px, bấm mở /huong-dan`, async () => {
      mockViewport(desktop);
      const router = openAs(hongId, HONG, "/thong-bao");
      const header = (await screen.findAllByRole("banner"))[0] as HTMLElement;
      const help = await within(header).findByRole("link", { name: "Hướng dẫn sử dụng" });
      expect(help.className).toMatch(/\bsize-11\b/);
      expect(help.getAttribute("title")).toBe("Hướng dẫn sử dụng");
      // Bên trái chuông thông báo.
      const bell = within(header).getByRole("link", { name: /^Thông báo/ });
      expect(help.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await userEvent.click(help);
      expect(router.state.location.pathname).toBe("/huong-dan");
    });
  }

  test("AC-HELP-001 trang đăng nhập không có nút Hướng dẫn sử dụng", async () => {
    mockViewport(false);
    renderApp("/dang-nhap");
    await screen.findByRole("button", { name: "Đăng nhập" });
    expect(screen.queryByRole("link", { name: "Hướng dẫn sử dụng" })).toBeNull();
  });
});

describe("AC-HELP-002…005 chọn bản hướng dẫn theo vai trò", () => {
  test("AC-HELP-002 Sale Hồng chỉ thấy bản Nhân viên kinh doanh + phần chung, không có tab", async () => {
    mockViewport(true);
    openAs(hongId, HONG);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Hướng dẫn sử dụng" }),
    ).toBeInTheDocument();
    const region = await guideRegion("Nhân viên kinh doanh");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("region", { name: "Hướng dẫn Nhân viên kỹ thuật" })).toBeNull();
    // Phần chung có trong mọi bản.
    const titles = sectionTitles(region);
    expect(titles).toContain("Đăng nhập & đổi mật khẩu");
    expect(titles).toContain("Thông báo");
    expect(titles).toContain("Trang Cá nhân");
  });

  test("AC-HELP-003 Hà (SALE + TECHNICIAN) có đúng 2 tab, tab đầu được chọn, đổi tab lưu ?vai-tro=", async () => {
    mockViewport(true);
    const router = openAs(haId, HA);
    const tablist = await screen.findByRole("tablist", { name: "Vai trò" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Nhân viên kinh doanh", "Nhân viên kỹ thuật"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    const saleRegion = await guideRegion("Nhân viên kinh doanh");
    const onlyIn = (role: "SALE" | "TECHNICIAN", other: "SALE" | "TECHNICIAN") => {
      const otherTitles = new Set(GUIDES[other].sections.map((s) => s.title));
      return GUIDES[role].sections.filter((s) => !otherTitles.has(s.title));
    };
    for (const section of onlyIn("TECHNICIAN", "SALE")) {
      expect(within(saleRegion).queryByRole("region", { name: section.title })).toBeNull();
    }

    await userEvent.click(tabs[1] as HTMLElement);
    expect(new URLSearchParams(router.state.location.search).get("vai-tro")).toBe("TECHNICIAN");
    const techRegion = await guideRegion("Nhân viên kỹ thuật");
    for (const section of onlyIn("SALE", "TECHNICIAN")) {
      expect(within(techRegion).queryByRole("region", { name: section.title })).toBeNull();
    }
    expect(screen.queryByRole("region", { name: "Hướng dẫn Nhân viên kinh doanh" })).toBeNull();
    expect(within(tablist).getByRole("tab", { name: "Nhân viên kỹ thuật" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("AC-HELP-003 mở thẳng ?vai-tro=TECHNICIAN thì Hà thấy bản Nhân viên kỹ thuật", async () => {
    mockViewport(true);
    openAs(haId, HA, "/huong-dan?vai-tro=TECHNICIAN");
    await guideRegion("Nhân viên kỹ thuật");
  });

  test("AC-HELP-004 Quản lý chung Nam thấy đủ 5 tab, mặc định Quản lý chung", async () => {
    mockViewport(true);
    openAs(namId, NAM);
    const tablist = await screen.findByRole("tablist", { name: "Vai trò" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(ALL_TABS);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await guideRegion("Quản lý chung");
  });

  test("AC-HELP-005 Sale Hồng mở ?vai-tro=TECHNICIAN vẫn chỉ thấy bản của mình", async () => {
    mockViewport(true);
    openAs(hongId, HONG, "/huong-dan?vai-tro=TECHNICIAN");
    await guideRegion("Nhân viên kinh doanh");
    expect(screen.queryByRole("region", { name: "Hướng dẫn Nhân viên kỹ thuật" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  test("AC-HELP-005 tham số vai trò không tồn tại → bản đầu tiên", async () => {
    mockViewport(true);
    openAs(haId, HA, "/huong-dan?vai-tro=KHONG_CO");
    await guideRegion("Nhân viên kinh doanh");
  });
});

describe("AC-HELP-006 cấu trúc mỗi bản", () => {
  test("AC-HELP-006 mỗi bản có mục lục, mỗi mục có tiêu đề + bước đánh số, có mục Trạng thái đơn hàng", async () => {
    mockViewport(true);
    openAs(namId, NAM);
    const tablist = await screen.findByRole("tablist", { name: "Vai trò" });
    for (const [index, label] of ALL_TABS.entries()) {
      await userEvent.click(within(tablist).getByRole("tab", { name: label }));
      const region = await guideRegion(label);
      const guide = Object.values(GUIDES)[index];
      if (!guide) throw new Error(`thiếu bản ${label}`);
      expect(guide.label).toBe(label);
      expect(within(region).getByText(guide.summary)).toBeInTheDocument();

      const toc = within(region).getByRole("navigation", { name: "Mục lục" });
      for (const section of guide.sections) {
        const link = within(toc).getByRole("link", { name: section.title });
        expect(link).toHaveAttribute("href", `#${section.id}`);
        const block = within(region).getByRole("region", { name: section.title });
        expect(block).toHaveAttribute("id", section.id);
        expect(within(block).getByRole("heading", { level: 2, name: section.title })).toBeTruthy();
        const list = within(block).getByRole("list");
        expect(list.tagName).toBe("OL");
        const steps = within(list).getAllByRole("listitem");
        expect(steps.map((s) => s.textContent)).toEqual(section.steps);
        expect(section.steps.length).toBeGreaterThan(0);
      }

      expect(within(toc).getByRole("link", { name: "Trạng thái đơn hàng" })).toBeInTheDocument();
      const statuses = within(region).getByRole("region", { name: "Trạng thái đơn hàng" });
      for (const statusLabel of Object.values(ORDER_STATUS_LABEL))
        expect(within(statuses).getByText(statusLabel, { selector: "dt *, dt" })).toBeTruthy();
      expect(within(toc).getByRole("link", { name: "Câu hỏi thường gặp" })).toBeInTheDocument();
      expect(within(region).getByRole("region", { name: "Câu hỏi thường gặp" })).toBeTruthy();
    }
  });
});

async function titlesOf(label: string) {
  mockViewport(true);
  openAs(
    namId,
    NAM,
    `/huong-dan?vai-tro=${Object.values(GUIDES).find((g) => g.label === label)?.role ?? ""}`,
  );
  return sectionTitles(await guideRegion(label));
}

function sectionText(title: string) {
  return screen.getByRole("region", { name: title }).textContent;
}

describe("AC-HELP-008…012 các mục bắt buộc của từng bản", () => {
  test("AC-HELP-008 bản Nhân viên kỹ thuật có đủ mục", async () => {
    const titles = await titlesOf("Nhân viên kỹ thuật");
    expect(titles).toEqual(
      expect.arrayContaining([
        "Việc của tôi",
        "Tiếp nhận / Từ chối đầu việc",
        "Bắt đầu làm",
        "Thêm dòng hàng tại hiện trường",
        "Ghi tiềm năng khách hàng",
        "Báo xong (giờ thực tế)",
        "Tải ảnh phiếu & Hoàn tất đơn",
        "Khi đầu việc bị mở lại",
      ]),
    );
    expect(sectionText("Tiếp nhận / Từ chối đầu việc")).toMatch(/bắt buộc.*lý do/i);
    expect(sectionText("Báo xong (giờ thực tế)")).toMatch(/giờ thực tế/i);
  });

  test("AC-HELP-009 bản Nhân viên kinh doanh có đủ mục", async () => {
    const titles = await titlesOf("Nhân viên kinh doanh");
    expect(titles).toEqual(
      expect.arrayContaining([
        "Khách hàng",
        "Tạo đơn & dòng hàng",
        "Lưu nháp",
        "Gửi đơn",
        "Thu hồi / Huỷ đơn",
        "Sửa liên hệ & dòng hàng sau khi gửi",
        "In hoá đơn",
        "Ghi nhận quà tặng KH",
        "Báo cáo doanh thu & KPI của tôi",
      ]),
    );
    const create = sectionText("Tạo đơn & dòng hàng");
    for (const phrase of [/giá cố định/i, /giảm giá/i, /tặng kèm/i, /ghi doanh số/i])
      expect(create).toMatch(phrase);
    expect(sectionText("Lưu nháp")).toMatch(/ít nhất 1 dòng/i);
    expect(sectionText("Gửi đơn")).toMatch(/địa chỉ thi công/i);
    expect(sectionText("In hoá đơn")).toMatch(/máy tính/i);
  });

  test("AC-HELP-010 bản Chăm sóc khách hàng có đủ mục", async () => {
    const titles = await titlesOf("Chăm sóc khách hàng");
    expect(titles).toEqual(
      expect.arrayContaining([
        "Tạo đơn",
        "Huỷ đơn mình tạo",
        "Phản hồi khách hàng",
        "Tạo yêu cầu chỉnh sửa",
        "Khách hàng",
        "Ghi nhận quà tặng KH",
        "Thông báo đơn mình tạo",
        "Báo cáo doanh thu của tôi",
      ]),
    );
    expect(sectionText("Tạo đơn")).toMatch(/không gửi được/i);
    expect(sectionText("Tạo đơn")).toMatch(/Quản lý chung/);
    expect(sectionText("Phản hồi khách hàng")).toMatch(/sao/i);
  });

  test("AC-HELP-011 bản Quản lý kỹ thuật có đủ mục", async () => {
    const titles = await titlesOf("Quản lý kỹ thuật");
    expect(titles).toEqual(
      expect.arrayContaining([
        "Đơn chờ điều phối",
        "Tạo đầu việc",
        "Bảng đầu việc & Cần giao lại",
        "Thêm/gỡ người, sửa/huỷ đầu việc",
        "Lịch & tải việc",
        "Hoàn tất thay kỹ thuật viên",
        "Chuyển Chỉnh sửa & mở lại đầu việc",
        "Đầu việc phát sinh",
        "Công việc theo nhân viên",
      ]),
    );
    const create = sectionText("Tạo đầu việc");
    for (const phrase of [/giờ/i, /hạn/i, /nhiều kỹ thuật viên/i]) expect(create).toMatch(phrase);
    const reopen = sectionText("Chuyển Chỉnh sửa & mở lại đầu việc");
    expect(reopen).toMatch(/mức lỗi/i);
    expect(reopen).toMatch(/KPI/);
  });

  test("AC-HELP-012 bản Quản lý chung có đủ mục + nhắc xem các tab khác", async () => {
    const titles = await titlesOf("Quản lý chung");
    expect(titles).toEqual(
      expect.arrayContaining([
        "Nhân sự & phân quyền",
        "Phòng ban",
        "Thông tin công ty",
        "Danh mục sản phẩm, dịch vụ",
        "Thiết lập doanh thu KPI",
        "Huỷ đơn đang thực hiện",
        "Báo cáo & biểu đồ",
        "Nhật ký hệ thống",
      ]),
    );
    const staff = sectionText("Nhân sự & phân quyền");
    for (const phrase of [/vai trò/i, /mật khẩu tạm/i, /khoá/i]) expect(staff).toMatch(phrase);
    const catalog = sectionText("Danh mục sản phẩm, dịch vụ");
    for (const phrase of [/giá vốn/i, /CSV/, /ngừng kinh doanh/i]) expect(catalog).toMatch(phrase);
    const reports = sectionText("Báo cáo & biểu đồ");
    for (const phrase of [/Báo cáo KPI/, /Biểu đồ kinh doanh/, /doanh thu/i])
      expect(reports).toMatch(phrase);
    const region = await guideRegion("Quản lý chung");
    expect(region.textContent).toMatch(/xem các tab tương ứng/);
  });
});
