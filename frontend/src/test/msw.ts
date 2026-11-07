import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/** M21-02b: the profile page (`/ca-nhan`, reached from many shell/bottom-nav tests) always loads the
 * caller's own KPI card — a neutral default so those tests need not mock it; KPI tests override it. */
const defaults = [
  http.get("/api/v1/me/kpi-sales", ({ request }) =>
    HttpResponse.json({
      month: new URL(request.url).searchParams.get("month") ?? "2026-11",
      total_sales: 0,
      net_revenue: 0,
      target: null,
      achievement_pct: null,
    }),
  ),
];

/** Shared MSW server: tests add handlers with server.use(...); unhandled requests fail the test. */
export const server = setupServer(...defaults);
