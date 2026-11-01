import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type HttpResponseResolver } from "msw";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { AppProviders } from "../../app/providers";
import { createQueryClient } from "../../app/queryClient";
import { GiftFormSheet } from "../../features/customerGifts/components/GiftFormSheet";
import { CustomerFormSheet } from "../../features/customers/components/CustomerFormSheet";
import { DepartmentFormSheet } from "../../features/departments/components/DepartmentFormSheet";
import { EmployeeFormSheet } from "../../features/employees/components/EmployeeFormSheet";
import type { Order } from "../../features/orders/api";
import { EditContactSheet } from "../../features/orders/components/EditContactSheet";
import { ProductServiceGroupFormSheet } from "../../features/productServiceGroups/components/ProductServiceGroupFormSheet";
import { ProductFormSheet } from "../../features/products/components/ProductFormSheet";
import { ServiceFormSheet } from "../../features/services/components/ServiceFormSheet";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";

type Customer = components["schemas"]["CustomerOut"];
type Product = components["schemas"]["ProductOut"];
type Service = components["schemas"]["ServiceOut"];

const customer: Customer = {
  id: "e0000000-0000-4000-8000-000000000007",
  code: "KH00001",
  type: "INDIVIDUAL",
  name: "Nguyễn Thị Lan",
  contact_person: null,
  contact_person_phone: null,
  phone: "0912345678",
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
  created_by: "9d1f0c2e-0000-4000-8000-000000000003",
  version: 1,
};

const product: Product = {
  id: "e0000000-0000-4000-8000-000000000005",
  sku: "LCD1137",
  name: "Màn hình Dell 22 inch",
  category: "MONITOR",
  brand: "Dell",
  unit: "CAI",
  price: 2_800_000,
  cost_price: 2_100_000,
  vat_rate: "10.00",
  price_fixed: false,
  warranty_months: 24,
  specs: null,
  image_attachment_id: null,
  is_active: true,
  version: 1,
};

const service: Service = {
  id: "e0000000-0000-4000-8000-000000000006",
  code: "DV-LAPCAM",
  name: "Công đi dây + lắp đặt hệ thống camera",
  category: "NETWORK_CABLING",
  unit: "DIEM",
  price: 300_000,
  cost_price: 150_000,
  vat_rate: "10.00",
  price_fixed: false,
  default_estimated_hours: "2.00",
  description: "Bao gồm đi dây âm tường",
  is_active: true,
  version: 1,
};

type CustomerGift = components["schemas"]["CustomerGiftOut"];
type Employee = components["schemas"]["EmployeeOut"];

const gift: CustomerGift = {
  id: "e0000000-0000-4000-8000-000000000008",
  customer_id: customer.id,
  occasion_name: "Tết 2027",
  performed_date: "2027-01-20",
  gift_name: "Giỏ quà Tết",
  quantity: 2,
  unit_price: 500_000,
  other_cost: 50_000,
  total_amount: 1_050_000,
  note: null,
  performed_by: {
    id: "a0000000-0000-4000-8000-000000000010",
    code: "NV005",
    full_name: "Nguyễn Thị Hoa",
  },
  requested_by: {
    id: "a0000000-0000-4000-8000-000000000013",
    code: "NV001",
    full_name: "Nguyễn Văn An",
  },
  created_by: "a0000000-0000-4000-8000-000000000010",
  version: 1,
  created_at: "2027-01-20T03:00:00Z",
  updated_at: "2027-01-20T03:00:00Z",
};

const SALES = { id: "d2222222-2222-4222-8222-222222222222", name: "Kinh doanh", is_active: true };

const employee: Employee = {
  id: "e0000000-0000-4000-8000-000000000009",
  code: "NV005",
  full_name: "Lê Thị Hoa",
  username: "hoa.lt",
  email: "hoa.le@smyou.vn",
  phone: "0932068787",
  department: SALES,
  title: "Nhân viên kinh doanh",
  roles: ["SALE"],
  is_active: true,
  is_locked: false,
  must_change_password: false,
  temp_password_expires_at: null,
  version: 1,
  birth_date: null,
  birth_place: null,
  gender: null,
  address: null,
  id_number: null,
  id_issued_date: null,
  id_issued_place: null,
  marital_status: null,
};

const order: Order = {
  id: "b0000000-0000-4000-8000-000000000012",
  code: "DH2610-0012",
  status: "PENDING_DISPATCH",
  division_id: null,
  division_name: null,
  customer_id: null,
  customer_name: "Cty Sáng Tạo Mới",
  customer_phone: "0909123456",
  customer_email: null,
  customer_tax_code: null,
  service_address: "12 Lê Lợi, Q1, TP.HCM",
  work_description: "Lắp đặt camera an ninh",
  priority: "NORMAL",
  requested_date: null,
  subtotal: 0,
  discount_amount: 0,
  vat_amount: 0,
  total: 0,
  payment_status: "UNPAID",
  payment_method: null,
  csat_rating: null,
  csat_comment: null,
  csat_recorded_by: null,
  csat_recorded_at: null,
  revision_no: 0,
  created_by: "a0000000-0000-4000-8000-000000000010",
  version: 3,
  lines: [],
  allowed_commands: [],
  can_edit_contact: true,
  can_edit_lines_after_submit: false,
  can_add_lines_on_site: false,
  can_upload_confirmation: false,
  can_complete: false,
  can_revise: false,
  has_pending_revision_request: false,
};

interface ModalRow {
  modal: string;
  title: string;
  method: "post" | "patch";
  path: string;
  /** The text field the test edits; its typed value must survive the failed save. */
  field: string;
  value: string;
  ok: () => Response;
  /** Toast shown on save for a modal that by design stays open after it (gift sheet keeps the
   * photo section usable); the test then checks the error is gone instead of `onClose`. */
  savedToast?: string;
  /** Extra GETs the modal needs to render (e.g. the active departments list). */
  stubs?: () => void;
  render: (onClose: () => void) => ReactNode;
}

/** One row per modal (AC-UI-063) — add a row when a new modal with a Lưu button ships. */
const MODALS: ModalRow[] = [
  {
    modal: "Sửa khách hàng",
    title: "Sửa khách hàng",
    method: "patch",
    path: "/api/v1/customers/:id",
    field: "Tên khách hàng",
    value: "Nguyễn Thị Lan Anh",
    ok: () => HttpResponse.json({ ...customer, duplicate_phone_matches: [] }),
    render: (onClose) => <CustomerFormSheet customer={customer} canManage onClose={onClose} />,
  },
  {
    modal: "Sửa sản phẩm",
    title: "Sửa sản phẩm",
    method: "patch",
    path: "/api/v1/products/:id",
    field: "Tên sản phẩm",
    value: "Màn hình Dell 24 inch",
    ok: () => HttpResponse.json(product),
    render: (onClose) => <ProductFormSheet product={product} canManage onClose={onClose} />,
  },
  {
    modal: "Sửa dịch vụ",
    title: "Sửa dịch vụ",
    method: "patch",
    path: "/api/v1/services/:id",
    field: "Tên dịch vụ",
    value: "Lắp đặt camera",
    ok: () => HttpResponse.json(service),
    render: (onClose) => <ServiceFormSheet service={service} canManage onClose={onClose} />,
  },
  {
    modal: "Thêm nhóm SP/DV",
    title: "Thêm nhóm",
    method: "post",
    path: "/api/v1/product-service-groups",
    field: "Tên nhóm",
    value: "Thiết bị mạng",
    ok: () =>
      HttpResponse.json(
        { id: "g-new", name: "Thiết bị mạng", is_active: true, version: 1 },
        { status: 201 },
      ),
    render: (onClose) => <ProductServiceGroupFormSheet canManage onClose={onClose} />,
  },
  {
    modal: "Thêm phòng ban",
    title: "Thêm phòng ban",
    method: "post",
    path: "/api/v1/departments",
    field: "Tên phòng ban",
    value: "Kế Toán - Tài chính",
    ok: () =>
      HttpResponse.json(
        {
          id: "d-new",
          name: "Kế Toán - Tài chính",
          is_active: true,
          version: 1,
          created_at: "2026-10-31T00:00:00Z",
          updated_at: "2026-10-31T00:00:00Z",
        },
        { status: 201 },
      ),
    render: (onClose) => <DepartmentFormSheet onClose={onClose} onToggle={() => undefined} />,
  },
  {
    modal: "Sửa nhân sự",
    title: "Sửa nhân viên",
    method: "patch",
    path: "/api/v1/employees/:id",
    field: "Họ và tên",
    value: "Lê Thị Hoa Mai",
    ok: () => HttpResponse.json({ ...employee, full_name: "Lê Thị Hoa Mai", version: 2 }),
    stubs: () => {
      server.use(
        http.get("/api/v1/departments", () =>
          HttpResponse.json({ items: [SALES], total: 1, limit: 100, offset: 0 }),
        ),
      );
    },
    render: (onClose) => <EmployeeFormSheet employee={employee} canManage onClose={onClose} />,
  },
  {
    modal: "Sửa quà tặng",
    title: "Sửa quà tặng",
    method: "patch",
    path: "/api/v1/customer-gifts/:id",
    field: "Tên gói quà",
    value: "Giỏ quà Tết cao cấp",
    ok: () => HttpResponse.json({ ...gift, gift_name: "Giỏ quà Tết cao cấp", version: 2 }),
    savedToast: "Đã cập nhật.",
    stubs: () => {
      server.use(
        http.get("/api/v1/customer-gifts/:id/photos", () => HttpResponse.json({ items: [] })),
      );
    },
    render: (onClose) => (
      <GiftFormSheet
        gift={gift}
        customerId={customer.id}
        customerName={customer.name}
        onClose={onClose}
      />
    ),
  },
  {
    modal: "Sửa liên hệ",
    title: "Sửa liên hệ",
    method: "patch",
    path: "/api/v1/orders/:id/contact",
    field: "Địa chỉ thi công",
    value: "45 Nguyễn Huệ, Q1, TP.HCM",
    ok: () =>
      HttpResponse.json({ ...order, service_address: "45 Nguyễn Huệ, Q1, TP.HCM", version: 4 }),
    render: (onClose) => (
      <EditContactSheet
        order={order}
        onClose={onClose}
        onReload={() => undefined}
        runWrite={(task) => task(order)}
      />
    ),
  },
];

const FAILURES: [string, HttpResponseResolver][] = [
  [
    "422",
    () =>
      HttpResponse.json(
        { status: 422, code: "VALIDATION_ERROR", detail: "Dữ liệu không hợp lệ.", errors: [] },
        { status: 422 },
      ),
  ],
  [
    "409",
    () =>
      HttpResponse.json(
        { status: 409, code: "CONFLICT", detail: "Xung đột dữ liệu, vui lòng thử lại." },
        { status: 409 },
      ),
  ],
  ["lỗi mạng", () => HttpResponse.error()],
];

function renderModal(node: ReactNode) {
  server.use(
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id: "a0000000-0000-4000-8000-000000000013",
          code: "NV001",
          full_name: "Nguyễn Văn An",
          email: "an.nguyen@smyou.vn",
          title: null,
          department: "MANAGEMENT",
        },
        roles: ["MANAGER"],
        capabilities: {},
        counters: {},
      }),
    ),
  );
  const router = createMemoryRouter([{ path: "/", element: node }], { initialEntries: ["/"] });
  render(
    <AppProviders queryClient={createQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

describe("AC-UI-063 mọi modal có nút Lưu: lỗi → vẫn mở, giữ dữ liệu, Alert trong modal; 200 → đóng", () => {
  test.each(
    MODALS.flatMap((row) => FAILURES.map(([kind, fail]) => [row.modal, kind, row, fail] as const)),
  )("AC-UI-063 %s — %s", async (_modal, _kind, row, fail) => {
    const onClose = vi.fn();
    row.stubs?.();
    server.use(http[row.method](row.path, fail));
    renderModal(row.render(onClose));
    const user = userEvent.setup();
    const dialog = await screen.findByRole("dialog", { name: row.title });
    const input = within(dialog).getByLabelText(row.field);
    await user.clear(input);
    await user.type(input, row.value);
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: row.title })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(row.field)).toHaveValue(row.value);
    expect(onClose).not.toHaveBeenCalled();

    server.use(http[row.method](row.path, row.ok));
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    if (row.savedToast) {
      expect(await screen.findByText(row.savedToast)).toBeInTheDocument();
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
      return;
    }
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
