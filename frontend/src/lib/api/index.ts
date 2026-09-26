import type { LoginResponse } from "./client";
import { createApiClient } from "./client";

interface SessionHandlers {
  lost?: () => void;
  renewed?: (session: LoginResponse) => void;
}
let handlers: SessionHandlers = {};

/** The app registers what session changes mean for its state (see app/providers.tsx). */
export function setSessionHandlers(next: SessionHandlers): void {
  handlers = next;
}

export const api = createApiClient({
  onSessionLost: () => {
    handlers.lost?.();
  },
  onSessionRenewed: (session) => {
    handlers.renewed?.(session);
  },
});
