import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";
import { compressImage, validateImageFile } from "../products/imageCompression";
import { signedInAs, type Person } from "../dispatch/testFixtures";
import { uploadGiftPhoto } from "./uploadGiftPhoto";

type CustomerGift = components["schemas"]["CustomerGiftOut"];
type Customer = components["schemas"]["CustomerOut"];
type Employee = components["schemas"]["EmployeeOut"];
type GiftPhoto = components["schemas"]["GiftPhoto"];

vi.mock("../products/imageCompression", () => ({
  validateImageFile: vi.fn(),
  compressImage: vi.fn(),
}));
vi.mock("./uploadGiftPhoto", () => ({
  uploadGiftPhoto: vi.fn(),
}));

const anId = "a0000000-0000-4000-8000-000000000001";
const hoaId = "a0000000-0000-4000-8000-000000000010";
const ducId = "a0000000-0000-4000-8000-000000000084";
const kh1Id = "c0000000-0000-4000-8000-000000000001";
const giftId = "d0000000-0000-4000-8000-000000000001";

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": ["all"],
    "customer_gift.read": ["all"],
    "customer_gift.manage": ["all"],
  },
};
const DUC: Person = {
  code: "NV017",
  full_name: "Nguyễn Văn Đức",
  email: "duc.nguyen@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["all"] },
};

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: kh1Id,
    code: "KH00001",
    type: "COMPANY",
    name: "Cty Sáng Tạo Mới",
    contact_person: null,
    contact_person_phone: null,
    phone: "0909123456",
    email: null,
    tax_code: null,
    address: null,
    note: null,
    founded_date: null,
    director_name: null,
    director_phone: null,
    it_contact_name: null,
    it_contact_phone: null,
    date_of_birth: null,
    gender: null,
    occupation: null,
    version: 1,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  } as Customer;
}

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: hoaId,
    code: "NV005",
    full_name: "Nguyễn Thị Hoa",
    email: "hoa.nguyen@smyou.vn",
    phone: null,
    title: null,
    department: "",
    roles: ["SALE"],
    is_active: true,
    is_locked: false,
    must_change_password: false,
    version: 1,
    ...overrides,
  };
}

function gift(overrides: Partial<CustomerGift> = {}): CustomerGift {
  return {
    id: giftId,
    customer_id: kh1Id,
    occasion_name: "Tết 2027",
    performed_date: "2027-01-20",
    gift_name: "Giỏ quà Tết",
    quantity: 2,
    unit_price: 500000,
    other_cost: 50000,
    total_amount: 1050000,
    note: null,
    performed_by: { id: hoaId, code: "NV005", full_name: "Nguyễn Thị Hoa" },
    requested_by: { id: anId, code: "NV001", full_name: "Nguyễn Văn An" },
    created_by: hoaId,
    version: 1,
    created_at: "2027-01-20T03:00:00Z",
    updated_at: "2027-01-20T03:00:00Z",
    ...overrides,
  };
}

function photo(overrides: Partial<GiftPhoto> = {}): GiftPhoto {
  return {
    id: "e0000000-0000-4000-8000-000000000001",
    mime_type: "image/jpeg",
    size_bytes: 123,
    uploaded_by: hoaId,
    uploaded_by_name: "Nguyễn Thị Hoa",
    created_at: "2027-01-20T03:00:00Z",
    ...overrides,
  };
}

function stub({
  customers = [customer()] as Customer[],
  gifts = [] as CustomerGift[],
  photos = [] as GiftPhoto[],
}: { customers?: Customer[]; gifts?: CustomerGift[]; photos?: GiftPhoto[] } = {}) {
  server.use(
    http.get("/api/v1/customers", () =>
      HttpResponse.json({ items: customers, total: customers.length }),
    ),
    http.get("/api/v1/employees", () => HttpResponse.json({ items: [employee()], total: 1 })),
    http.get("/api/v1/customer-gifts", ({ request }) => {
      const url = new URL(request.url);
      const customerId = url.searchParams.get("customer_id");
      const items = gifts.filter((g) => g.customer_id === customerId);
      return HttpResponse.json({ items, total: items.length, limit: 20, offset: 0 });
    }),
    http.get("/api/v1/customer-gifts/:id/photos", () => HttpResponse.json({ items: photos })),
  );
  return { gifts, photos };
}

async function openPage() {
  renderApp("/customer-gifts");
  const user = userEvent.setup();
  await screen.findByText("Ghi nhận quà tặng KH");
  return user;
}

async function selectCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Khách hàng"), "Sáng Tạo");
  const option = await screen.findByRole("option", { name: /Cty Sáng Tạo Mới/ });
  await user.click(option);
}

/** Chọn khách hàng trong ô tìm kiếm riêng bên trong sheet (scoped by dialog — trang vẫn có ô
 * "Khách hàng" của mình khi sheet mở). */
async function selectCustomerInSheet(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) {
  await user.type(within(dialog).getByLabelText("Khách hàng"), "Sáng Tạo");
  const option = await within(dialog).findByRole("option", { name: /Cty Sáng Tạo Mới/ });
  await user.click(option);
}

/** Chọn nhân viên qua ô tìm kiếm (tên/mã/SĐT/email) — "Người thực hiện"/"Người yêu cầu". */
async function selectEmployeeInSheet(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  label: string,
) {
  await user.type(within(dialog).getByLabelText(label), "Hoa");
  const option = await within(dialog).findByRole("option", { name: /Nguyễn Thị Hoa/ });
  await user.click(option);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Trang Ghi nhận quà tặng KH (/customer-gifts)", () => {
  test("AC-GFT-020 chưa chọn khách hàng: trạng thái rỗng, nút Thêm quà tặng vẫn bật", async () => {
    signedInAs(anId, AN);
    stub();
    await openPage();

    expect(screen.getByText("Chọn khách hàng để xem danh sách quà tặng.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm quà tặng" })).toBeEnabled();
  });

  test("AC-GFT-021 chọn khách hàng: gọi đúng customer_id, hiện danh sách", async () => {
    signedInAs(anId, AN);
    stub({ gifts: [gift()] });
    const user = await openPage();

    await selectCustomer(user);

    expect(await screen.findByText("Giỏ quà Tết")).toBeInTheDocument();
    expect(screen.getByText("Tết 2027")).toBeInTheDocument();
  });

  test("AC-GFT-022 chưa chọn khách hàng trong sheet: báo lỗi, không gửi request", async () => {
    signedInAs(anId, AN);
    let created = false;
    server.use(
      http.post("/api/v1/customer-gifts", () => {
        created = true;
        return HttpResponse.json(gift(), { status: 201 });
      }),
    );
    stub();
    const user = await openPage();
    await user.click(screen.getByRole("button", { name: "Thêm quà tặng" }));

    const dialog = await screen.findByRole("dialog", { name: "Thêm quà tặng" });
    await user.type(within(dialog).getByLabelText("Dịp/lễ"), "Tết 2027");
    await user.type(within(dialog).getByLabelText("Ngày thực hiện"), "2027-01-20");
    await user.type(within(dialog).getByLabelText("Tên gói quà"), "Giỏ quà Tết");
    await user.clear(within(dialog).getByLabelText("Số lượng"));
    await user.type(within(dialog).getByLabelText("Số lượng"), "2");
    await user.clear(within(dialog).getByLabelText("Đơn giá"));
    await user.type(within(dialog).getByLabelText("Đơn giá"), "500000");
    await selectEmployeeInSheet(user, dialog, "Người thực hiện");
    await selectEmployeeInSheet(user, dialog, "Người yêu cầu");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Vui lòng chọn khách hàng.")).toBeInTheDocument();
    expect(created).toBe(false);
  });

  test("AC-GFT-022b thiếu Người thực hiện: báo lỗi, không gửi request", async () => {
    signedInAs(anId, AN);
    let created = false;
    server.use(
      http.post("/api/v1/customer-gifts", () => {
        created = true;
        return HttpResponse.json(gift(), { status: 201 });
      }),
    );
    stub();
    const user = await openPage();
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Thêm quà tặng" }));

    const dialog = await screen.findByRole("dialog", { name: "Thêm quà tặng" });
    await user.type(within(dialog).getByLabelText("Dịp/lễ"), "Tết 2027");
    await user.type(within(dialog).getByLabelText("Ngày thực hiện"), "2027-01-20");
    await user.type(within(dialog).getByLabelText("Tên gói quà"), "Giỏ quà Tết");
    await user.clear(within(dialog).getByLabelText("Số lượng"));
    await user.type(within(dialog).getByLabelText("Số lượng"), "2");
    await user.clear(within(dialog).getByLabelText("Đơn giá"));
    await user.type(within(dialog).getByLabelText("Đơn giá"), "500000");
    await selectEmployeeInSheet(user, dialog, "Người yêu cầu");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Vui lòng chọn người thực hiện.")).toBeInTheDocument();
    expect(created).toBe(false);
  });

  test("AC-GFT-023 chọn khách hàng trong sheet (trang chưa chọn): POST đúng customer_id, trang tự chuyển sang hiện danh sách", async () => {
    signedInAs(anId, AN);
    let payload: unknown;
    const { gifts } = stub({ gifts: [] });
    server.use(
      http.post("/api/v1/customer-gifts", async ({ request }) => {
        payload = await request.json();
        const created = gift();
        gifts.push(created);
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const user = await openPage();
    await user.click(screen.getByRole("button", { name: "Thêm quà tặng" }));

    const dialog = await screen.findByRole("dialog", { name: "Thêm quà tặng" });
    await selectCustomerInSheet(user, dialog);
    await user.type(within(dialog).getByLabelText("Dịp/lễ"), "Tết 2027");
    await user.type(within(dialog).getByLabelText("Ngày thực hiện"), "2027-01-20");
    await user.type(within(dialog).getByLabelText("Tên gói quà"), "Giỏ quà Tết");
    await user.clear(within(dialog).getByLabelText("Số lượng"));
    await user.type(within(dialog).getByLabelText("Số lượng"), "2");
    await user.clear(within(dialog).getByLabelText("Đơn giá"));
    await user.type(within(dialog).getByLabelText("Đơn giá"), "500000");
    await selectEmployeeInSheet(user, dialog, "Người thực hiện");
    await selectEmployeeInSheet(user, dialog, "Người yêu cầu");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(screen.getByText("Đã thêm quà tặng.")).toBeInTheDocument();
    });
    expect(payload).toMatchObject({
      customer_id: kh1Id,
      occasion_name: "Tết 2027",
      performed_date: "2027-01-20",
      gift_name: "Giỏ quà Tết",
      quantity: 2,
      unit_price: 500000,
      performed_by: hoaId,
      requested_by: hoaId,
    });
    expect(payload).not.toHaveProperty("total_amount");
    expect(await screen.findByText("Giỏ quà Tết")).toBeInTheDocument();
  });

  test("AC-GFT-024 tải ảnh: progress rồi thumbnail, POST đúng gift id", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.mocked(validateImageFile).mockReturnValue(null);
    vi.mocked(compressImage).mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    let finishUpload: (() => void) | undefined;
    const newPhoto = photo();
    let capturedGiftId: string | undefined;
    vi.mocked(uploadGiftPhoto).mockImplementation(
      (id, _blob, onProgress) =>
        new Promise((resolve) => {
          capturedGiftId = id;
          onProgress(50);
          finishUpload = () => {
            onProgress(100);
            resolve(newPhoto);
          };
        }),
    );
    signedInAs(anId, AN);
    const { photos } = stub({ gifts: [gift()] });
    const user = await openPage();
    await selectCustomer(user);
    await user.click(await screen.findByText("Giỏ quà Tết"));

    const input = await screen.findByLabelText("Tải ảnh", { exact: false });
    await user.upload(input, new File([new Uint8Array(10)], "qua.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText("Đang tải ảnh… 50%")).toBeInTheDocument();
    expect(capturedGiftId).toBe(giftId);
    photos.push(newPhoto);
    finishUpload?.();
    await waitFor(() => {
      expect(screen.queryByText("Đang tải ảnh… 50%")).not.toBeInTheDocument();
    });
  });

  test("AC-GFT-025 STALE_VERSION: banner lỗi + nút Tải lại", async () => {
    signedInAs(anId, AN);
    stub({ gifts: [gift()] });
    server.use(
      http.patch("/api/v1/customer-gifts/:id", () =>
        HttpResponse.json(
          { title: "Conflict", status: 409, code: "STALE_VERSION", detail: "Đã bị thay đổi." },
          { status: 409 },
        ),
      ),
    );
    const user = await openPage();
    await selectCustomer(user);
    await user.click(await screen.findByText("Giỏ quà Tết"));
    await user.click(await screen.findByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã bị thay đổi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });

  test("AC-GFT-026 không có customer_gift.read: 403 khi mở /customer-gifts", async () => {
    signedInAs(ducId, DUC);
    stub();
    renderApp("/customer-gifts");

    expect(await screen.findByText(/không có quyền/i)).toBeInTheDocument();
  });
});
