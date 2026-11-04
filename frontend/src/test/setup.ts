import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw";

/** The full suite runs ~60 jsdom workers in parallel; under that load a multi-request screen
 * (e.g. profile → push subscription state) can take longer than Testing Library's 1s default
 * to settle, making `findBy*` flaky. Same assertions, just more time to reach them. */
configure({ asyncUtilTimeout: 3000 });

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
