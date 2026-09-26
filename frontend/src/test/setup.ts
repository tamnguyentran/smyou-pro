import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  try {
    window.localStorage.clear();
  } catch {
    // storage unavailable: nothing to reset
  }
});
afterAll(() => {
  server.close();
});
