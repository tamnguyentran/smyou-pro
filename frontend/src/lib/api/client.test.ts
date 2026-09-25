import { describe, expect, test, vi } from "vitest";
import { createApiClient } from "./client";

function recordingFetch() {
  const urls: string[] = [];
  const fetchImpl = vi.fn((input: Request) => {
    urls.push(input.url);
    return Promise.resolve(
      new Response(JSON.stringify({ status: "ok", database: "ok", version: "0.1.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  return { urls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("createApiClient", () => {
  test("AC-SYS-014 base /smyoutask/ → gọi /smyoutask/api/v1/health", async () => {
    const { urls, fetchImpl } = recordingFetch();
    const client = createApiClient({
      baseUrl: "/smyoutask/",
      origin: "https://ilabsviet.com",
      fetch: fetchImpl,
    });

    const { data } = await client.GET("/api/v1/health");

    expect(urls).toEqual(["https://ilabsviet.com/smyoutask/api/v1/health"]);
    expect(data?.status).toBe("ok");
  });

  test("AC-SYS-014 base / → gọi /api/v1/health", async () => {
    const { urls, fetchImpl } = recordingFetch();
    const client = createApiClient({
      baseUrl: "/",
      origin: "http://localhost:5183",
      fetch: fetchImpl,
    });

    await client.GET("/api/v1/health");

    expect(urls).toEqual(["http://localhost:5183/api/v1/health"]);
  });

  test("AC-SYS-014 mặc định dùng import.meta.env.BASE_URL và window.location.origin", async () => {
    const { urls, fetchImpl } = recordingFetch();
    const client = createApiClient({ fetch: fetchImpl });

    await client.GET("/api/v1/health");

    expect(urls).toEqual([`${window.location.origin}/api/v1/health`]);
  });
});
