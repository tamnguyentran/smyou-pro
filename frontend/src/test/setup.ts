import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup(); // vitest runs without globals, so Testing Library cannot register this itself
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
