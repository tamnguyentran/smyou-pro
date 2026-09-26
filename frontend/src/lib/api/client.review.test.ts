import { expect, test, vi } from "vitest";
import { createApiClient } from "./client";

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Code review M1-01b: change-password needs an access token, so its 401 must refresh like any other call.
test("AC-AUTH-025 401 của change-password cũng tự làm mới rồi gọi lại", async () => {
  let refreshed = false;
  const calls: string[] = [];
  const fetchImpl = vi.fn((input: Request) => {
    const path = new URL(input.url).pathname;
    calls.push(`${input.method} ${path}`);
    if (path === "/api/v1/auth/refresh") {
      refreshed = true;
      return Promise.resolve(json(200, { employee: {}, must_change_password: true }));
    }
    return Promise.resolve(refreshed ? new Response(null, { status: 204 }) : json(401));
  }) as unknown as typeof fetch;
  const client = createApiClient({
    baseUrl: "/",
    origin: "http://app.test",
    fetch: fetchImpl,
    locks: null,
  });

  const { response } = await client.POST("/api/v1/auth/change-password", {
    body: { current_password: "TamThoi#14", new_password: "Khoa@SmYou9" },
  });

  expect(response.status).toBe(204);
  expect(calls).toEqual([
    "POST /api/v1/auth/change-password",
    "POST /api/v1/auth/refresh",
    "POST /api/v1/auth/change-password",
  ]);
});

test("AC-AUTH-025 phiên mới sau khi tự làm mới được báo cho app", async () => {
  let refreshed = false;
  const session = {
    employee: { id: "x", code: "NV001", full_name: "An", roles: ["MANAGER"] },
    must_change_password: false,
  };
  const fetchImpl = vi.fn((input: Request) => {
    const path = new URL(input.url).pathname;
    if (path === "/api/v1/auth/refresh") {
      refreshed = true;
      return Promise.resolve(json(200, session));
    }
    return Promise.resolve(refreshed ? json(200) : json(401));
  }) as unknown as typeof fetch;
  const onSessionRenewed = vi.fn();
  const client = createApiClient({
    baseUrl: "/",
    origin: "http://app.test",
    fetch: fetchImpl,
    locks: null,
    onSessionRenewed,
  });

  await client.GET("/api/v1/health");

  expect(onSessionRenewed).toHaveBeenCalledWith(session);
});
