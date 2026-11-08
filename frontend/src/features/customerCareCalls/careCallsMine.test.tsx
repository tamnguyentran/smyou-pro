import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

// M27-03 (Q197): CSKH xem cuộc gọi của cả nhóm; checkbox "Chỉ cuộc gọi của tôi" (CSKH mặc định bật,
// Quản lý mặc định tắt; `?mine=` thắng mặc định).

type CareCall = components["schemas"]["CareCallOut"];

const lanId = "a0000000-0000-4000-8000-000000000018";
const maiId = "a0000000-0000-4000-8000-000000000019";
const namId = "a0000000-0000-4000-8000-000000000002";

const all = ["all"];
const careCapabilities = {
  "dashboard.read": all,
  "customer.read": all,
  "customer.manage": all,
  "employee.lookup": all,
  "customer_care.call.record": all,
  "customer_care.call.read": all,
};
const LAN: Person = {
  code: "NV018",
  full_name: "Đỗ Thị Lan",
  email: "lan.do@smyou.vn",
  roles: ["CUSTOMER_CARE"],
  capabilities: { ...careCapabilities, "order.create": ["own"] },
};
const NAM: Person = {
  code: "NV002",
  full_name: "Phạm Văn Nam",
  email: "nam.pham@smyou.vn",
  roles: ["MANAGER", "CUSTOMER_CARE"],
  capabilities: { ...careCapabilities, "order.create": all },
};

function call(id: string, callerId: string, callerName: string, offered: string): CareCall {
  return {
    id,
    customer_id: "c0000000-0000-4000-8000-000000000271",
    customer_name: "Cty ABC",
    customer_phone: "0909271271",
    caller_id: callerId,
    caller_name: callerName,
    offered,
    customer_request: null,
    called_at: "2026-11-08T02:05:00Z",
  };
}
const CALLS = [
  call("e0000000-0000-4000-8000-000000000281", lanId, "Đỗ Thị Lan", "Camera IP 4MP"),
  call("e0000000-0000-4000-8000-000000000282", maiId, "Võ Thị Mai", "Máy in Canon LBP2900"),
  call("e0000000-0000-4000-8000-000000000283", namId, "Phạm Văn Nam", "Bảo trì máy tính"),
];

/** GET /customer-care-calls lọc theo `caller_id` như server; ghi lại query của mỗi lần gọi. */
function stub() {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/customer-care-calls", ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      const callerId = params.get("caller_id");
      const items = callerId ? CALLS.filter((c) => c.caller_id === callerId) : CALLS;
      return HttpResponse.json({ items, total: items.length, limit: 20, offset: 0 });
    }),
    http.get("/api/v1/customers", () => HttpResponse.json({ items: [], total: 0 })),
    http.get("/api/v1/employees/lookup", () => HttpResponse.json([])),
  );
  return queries;
}

async function openPage(path: string) {
  const router = renderApp(path);
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Chăm sóc khách hàng" });
  return { router, user };
}
const mineBox = () => screen.findByRole("checkbox", { name: "Chỉ cuộc gọi của tôi" });

describe("Chỉ cuộc gọi của tôi", () => {
  test("AC-CUS-081 Lan (CSKH) mở trang: checkbox bật, request đầu có caller_id=Lan, chỉ cuộc gọi của Lan, không ô 'Người gọi'", async () => {
    signedInAs(lanId, LAN);
    const queries = stub();
    await openPage("/customer-care");

    expect(await mineBox()).toBeChecked();
    expect(await screen.findByText("Camera IP 4MP")).toBeInTheDocument();
    expect(queries[0]?.get("caller_id")).toBe(lanId);
    expect(screen.queryByText("Máy in Canon LBP2900")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Người gọi")).not.toBeInTheDocument();
  });

  test("AC-CUS-082 Lan bỏ chọn: gọi lại không caller_id, thấy cuộc gọi của Lan + Mai, hiện ô 'Người gọi', URL ?mine=0", async () => {
    signedInAs(lanId, LAN);
    const queries = stub();
    const { router, user } = await openPage("/customer-care");
    await screen.findByText("Camera IP 4MP");

    await user.click(await mineBox());

    expect(await screen.findByText("Máy in Canon LBP2900")).toBeInTheDocument();
    expect(screen.getByText("Camera IP 4MP")).toBeInTheDocument();
    expect(queries.at(-1)?.has("caller_id")).toBe(false);
    expect(screen.getByRole("checkbox", { name: "Chỉ cuộc gọi của tôi" })).not.toBeChecked();
    expect(screen.getByLabelText("Người gọi")).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get("mine")).toBe("0");
  });

  test("AC-CUS-083 Nam (Quản lý): mặc định tắt, không caller_id; bật → caller_id=Nam, ẩn 'Người gọi', URL ?mine=1", async () => {
    signedInAs(namId, NAM);
    const queries = stub();
    const { router, user } = await openPage("/customer-care");

    expect(await mineBox()).not.toBeChecked();
    expect(await screen.findByText("Máy in Canon LBP2900")).toBeInTheDocument();
    expect(queries[0]?.has("caller_id")).toBe(false);
    expect(screen.getByLabelText("Người gọi")).toBeInTheDocument();

    await user.click(await mineBox());

    await waitFor(() => {
      expect(queries.at(-1)?.get("caller_id")).toBe(namId);
    });
    expect(await screen.findByText("Bảo trì máy tính")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Máy in Canon LBP2900")).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Người gọi")).not.toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get("mine")).toBe("1");
  });

  test("AC-CUS-084 Lan mở ?mine=0 → tắt, thấy tất cả (URL thắng mặc định)", async () => {
    signedInAs(lanId, LAN);
    const queries = stub();
    await openPage("/customer-care?mine=0");

    expect(await mineBox()).not.toBeChecked();
    expect(await screen.findByText("Máy in Canon LBP2900")).toBeInTheDocument();
    expect(screen.getByText("Camera IP 4MP")).toBeInTheDocument();
    expect(queries[0]?.has("caller_id")).toBe(false);
  });

  test("AC-CUS-084 Nam mở ?mine=1 → bật, chỉ cuộc gọi của Nam (URL thắng mặc định)", async () => {
    signedInAs(namId, NAM);
    const queries = stub();
    await openPage("/customer-care?mine=1");

    expect(await mineBox()).toBeChecked();
    expect(await screen.findByText("Bảo trì máy tính")).toBeInTheDocument();
    expect(queries[0]?.get("caller_id")).toBe(namId);
    expect(screen.queryByText("Camera IP 4MP")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Người gọi")).not.toBeInTheDocument();
  });
});
