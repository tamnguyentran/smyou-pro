import createClient, { type Client } from "openapi-fetch";
import { resolveBasePath } from "../basePath";
import type { components, paths } from "./schema";

export type LoginResponse = components["schemas"]["LoginResponse"];

/** The part of the Web Locks API we use (navigator.locks); injectable for tests. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface ApiClientOptions {
  /** Vite base URL of the build, i.e. import.meta.env.BASE_URL ("/" or "/smyoutask/"). */
  baseUrl?: string;
  /** Page origin; defaults to window.location.origin. */
  origin?: string;
  fetch?: typeof globalThis.fetch;
  /** Called when the session cannot be renewed (refresh refused). */
  onSessionLost?: () => void;
  /** Cross-tab lock for refresh; `null` = in-tab single-flight only. Defaults to navigator.locks. */
  locks?: LockManagerLike | null;
}

export type ApiClient = Client<paths> & {
  /** POST /auth/refresh, one at a time across calls and tabs. Resolves null when refused. */
  refreshSession(): Promise<LoginResponse | null>;
};

const REFRESH_LOCK = "smyou-refresh";

function defaultLocks(): LockManagerLike | null {
  return typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : null;
}

/**
 * Typed client for the backend; API paths are resolved under the app's BASE_PATH (ADR-014).
 * A 401 on a non-auth call triggers one shared refresh, then the call is retried once. The backend
 * revokes the whole session if the same refresh token is used twice (AC-AUTH-009), so refreshes must
 * never run in parallel — not within a tab and not across tabs.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const {
    baseUrl = import.meta.env.BASE_URL,
    origin = window.location.origin,
    onSessionLost,
  } = options;
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  // Resolve fetch per call so test interceptors (MSW) installed later still apply.
  const doFetch = (request: Request) => (options.fetch ?? globalThis.fetch)(request);
  const root = `${origin}${resolveBasePath(baseUrl).apiPrefix}`;
  const isAuthCall = (request: Request) =>
    new URL(request.url).pathname.startsWith(new URL(`${root}/api/v1/auth/`).pathname);

  let inflight: Promise<LoginResponse | null> | null = null;
  const refreshOnce = async (): Promise<LoginResponse | null> => {
    try {
      const response = await doFetch(
        new Request(`${root}/api/v1/auth/refresh`, { method: "POST" }),
      );
      return response.ok ? ((await response.json()) as LoginResponse) : null;
    } catch {
      return null;
    }
  };
  const refreshSession = () => {
    inflight ??= (locks ? locks.request(REFRESH_LOCK, refreshOnce) : refreshOnce()).finally(() => {
      inflight = null;
    });
    return inflight;
  };

  const client = createClient<paths>({ baseUrl: root, fetch: doFetch });
  const pristine = new WeakMap<Request, Request>();
  client.use({
    onRequest({ request }) {
      if (!isAuthCall(request)) pristine.set(request, request.clone());
      return undefined;
    },
    async onResponse({ request, response }) {
      const retry = pristine.get(request);
      if (response.status !== 401 || retry === undefined) return undefined;
      if ((await refreshSession()) === null) {
        onSessionLost?.();
        return undefined;
      }
      return doFetch(retry);
    },
  });
  return Object.assign(client, { refreshSession });
}
