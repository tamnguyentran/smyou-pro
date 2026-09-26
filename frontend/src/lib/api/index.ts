import { createApiClient } from "./client";

let sessionLost: (() => void) | undefined;

/** The app registers what "session lost" means (clear state → login page); see app/providers.tsx. */
export function setSessionLostHandler(handler: (() => void) | undefined): void {
  sessionLost = handler;
}

export const api = createApiClient({
  onSessionLost: () => {
    sessionLost?.();
  },
});
