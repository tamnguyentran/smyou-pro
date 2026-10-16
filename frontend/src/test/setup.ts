import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw";

/** jsdom's real `WebSocket` tries an actual network connection — every test that mounts
 * `AppShell` (M7-03's `useNotificationsRealtime`) would otherwise open one against a
 * nonexistent dev server and leak reconnect timers across tests. No-op by default; a test that
 * needs to assert socket behaviour stubs its own with `vi.stubGlobal("WebSocket", ...)`. */
class NoopWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {}
  close(): void {}
}
globalThis.WebSocket = NoopWebSocket as unknown as typeof WebSocket;

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
