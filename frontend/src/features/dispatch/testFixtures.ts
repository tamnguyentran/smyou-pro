import { http, HttpResponse } from "msw";
import type { components } from "../../lib/api/schema";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";

type OrderSummary = components["schemas"]["OrderSummary"];

/** Fixture dùng chung cho test hàng đợi điều phối + panel tạo task (spec M4-01b §3). */
export const tuanId = "a0000000-0000-4000-8000-000000000070";
export const hoaId = "a0000000-0000-4000-8000-000000000010";
export const anId = "a0000000-0000-4000-8000-000000000001";

export interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const self = ["self"];

/** Quản lý kỹ thuật — có `task.manage`. */
export const TUAN: Person = {
  code: "NV007",
  full_name: "Phạm Quốc Tuấn",
  email: "tuan.pham@smyou.vn",
  roles: ["TECH_LEAD"],
  capabilities: {
    "dashboard.read": all,
    "order.read": all,
    "task.manage": all,
    "order.revise": all,
    "task.reopen": all,
    "employee.read": all,
    "catalog.read": all,
    "profile.manage": self,
  },
};
export const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": all, "order.read": all, "order.create": all },
};
export const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: { "dashboard.read": all, "order.read": all, "audit.read": all },
};
/** Kỹ thuật viên được giao việc — `order.read` chỉ trong phạm vi đơn mình được giao. */
export const KHOA_TECH: Person = {
  code: "NV081",
  full_name: "Trần Minh Khoa",
  email: "khoa.tran@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": all, "order.read": ["assigned"], "profile.manage": self },
};

export function meBody(id: string, person: Person, counters: Record<string, number>) {
  return {
    employee: {
      id,
      code: person.code,
      full_name: person.full_name,
      email: person.email,
      title: null,
      department: "TECHNICAL",
    },
    roles: person.roles,
    capabilities: person.capabilities,
    counters,
  };
}

export function signedInAs(id: string, person: Person, counters: Record<string, number> = {}) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id, code: person.code, full_name: person.full_name, roles: person.roles },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () => HttpResponse.json(meBody(id, person, counters))),
  );
  markSignedIn();
}

export function summary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: "b0000000-0000-4000-8000-000000000020",
    code: "DH2610-0008",
    status: "PENDING_DISPATCH",
    division: null,
    customer_name: "Cty Sáng Tạo Mới",
    customer_phone: "0909123456",
    priority: "NORMAL",
    requested_date: "2026-10-10",
    total: 3300000,
    created_by: hoaId,
    created_by_name: "Nguyễn Thị Hoa",
    created_at: "2026-10-01T03:00:00Z",
    ...overrides,
  };
}

/** 4 đơn của spec §3, theo đúng thứ tự `sort=dispatch` mà API trả về. */
export const DON_I = summary({
  id: "b0000000-0000-4000-8000-000000000021",
  code: "DH2610-0009",
  customer_name: "Công ty TNHH Minh Phát",
  customer_phone: "0932068787",
  priority: "URGENT",
  requested_date: "2026-10-12",
  total: 11800000,
});
export const DON_K = summary({
  id: "b0000000-0000-4000-8000-000000000022",
  code: "DH2610-0010",
  priority: "HIGH",
  requested_date: "2026-10-08",
});
export const DON_H = summary({ requested_date: "2026-10-10" });
export const DON_L = summary({
  id: "b0000000-0000-4000-8000-000000000023",
  code: "DH2610-0011",
  priority: "LOW",
  requested_date: null,
});
export const QUEUE = [DON_I, DON_K, DON_H, DON_L];
