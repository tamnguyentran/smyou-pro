import { describe, expect, test, vi } from "vitest";
import { createApiClient } from "./client";

type Handler = (url: URL) => Response;

function mockFetch(handler: Handler) {
  const calls: string[] = [];
  const fetchImpl = vi.fn((input: Request) => {
    const url = new URL(input.url);
    calls.push(`${input.method} ${url.pathname}`);
    return Promise.resolve(handler(url));
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("AC-AUTH-025 tự làm mới phiên khi gặp 401", () => {
  test("AC-AUTH-025 nhiều lệnh 401 đồng thời chỉ gây 1 lần refresh, mỗi lệnh gọi lại đúng 1 lần", async () => {
    let refreshed = false;
    const { calls, fetchImpl } = mockFetch((url) => {
      if (url.pathname === "/api/v1/auth/refresh") {
        refreshed = true;
        return json(200, { employee: {}, must_change_password: false });
      }
      return refreshed ? json(200, { status: "ok", database: "ok", version: "1" }) : json(401);
    });
    const onSessionLost = vi.fn();
    const client = createApiClient({
      baseUrl: "/",
      origin: "http://app.test",
      fetch: fetchImpl,
      onSessionLost,
      locks: null,
    });

    const results = await Promise.all([1, 2, 3].map(() => client.GET("/api/v1/health")));

    expect(results.map((r) => r.response.status)).toEqual([200, 200, 200]);
    expect(calls.filter((c) => c === "POST /api/v1/auth/refresh")).toHaveLength(1);
    expect(calls.filter((c) => c === "GET /api/v1/health")).toHaveLength(6);
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  test("AC-AUTH-025 refresh thất bại → báo mất phiên, không gọi lại vô hạn", async () => {
    const { calls, fetchImpl } = mockFetch(() => json(401));
    const onSessionLost = vi.fn();
    const client = createApiClient({
      baseUrl: "/",
      origin: "http://app.test",
      fetch: fetchImpl,
      onSessionLost,
      locks: null,
    });

    const { response } = await client.GET("/api/v1/health");

    expect(response.status).toBe(401);
    expect(calls).toEqual(["GET /api/v1/health", "POST /api/v1/auth/refresh"]);
    expect(onSessionLost).toHaveBeenCalled();
  });

  test("AC-AUTH-025 lỗi 401 của chính /auth/* không kích hoạt refresh", async () => {
    const { calls, fetchImpl } = mockFetch(() => json(401, { code: "INVALID_CREDENTIALS" }));
    const onSessionLost = vi.fn();
    const client = createApiClient({
      baseUrl: "/",
      origin: "http://app.test",
      fetch: fetchImpl,
      onSessionLost,
      locks: null,
    });

    await client.POST("/api/v1/auth/login", { body: { email: "an@smyou.vn", password: "x" } });

    expect(calls).toEqual(["POST /api/v1/auth/login"]);
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  test("AC-AUTH-025 refresh giữa các tab đi qua Web Locks 'smyou-refresh'", async () => {
    let refreshed = false;
    const { fetchImpl } = mockFetch((url) => {
      if (url.pathname === "/api/v1/auth/refresh") {
        refreshed = true;
        return json(200, { employee: {}, must_change_password: false });
      }
      return refreshed ? json(200) : json(401);
    });
    const names: string[] = [];
    const locks = {
      request: <T>(name: string, callback: () => Promise<T>) => {
        names.push(name);
        return callback();
      },
    };
    const client = createApiClient({
      baseUrl: "/",
      origin: "http://app.test",
      fetch: fetchImpl,
      locks,
    });

    await client.GET("/api/v1/health");

    expect(names).toEqual(["smyou-refresh"]);
  });
});
