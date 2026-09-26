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
  /** Called with the fresh session after a silent refresh (roles or forced password change may differ). */
  onSessionRenewed?: (session: LoginResponse) => void;
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
 * A 401 (other than from login/refresh/logout) triggers one shared refresh, then the call is retried once. The backend
 * revokes the whole session if the same refresh token is used twice (AC-AUTH-009), so refreshes must
 * never run in parallel — not within a tab and not across tabs.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const {
    baseUrl = import.meta.env.BASE_URL,
    origin = window.location.origin,
    onSessionLost,
    onSessionRenewed,
  } = options;
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  // Resolve fetch per call so test interceptors (MSW) installed later still apply.
  const doFetch = (request: Request) => (options.fetch ?? globalThis.fetch)(request);
  const root = `${origin}${resolveBasePath(baseUrl).apiPrefix}`;
  // Only the public auth routes answer 401 for reasons a refresh cannot fix (wrong password, no
  // session). change-password needs an access token, so its 401 is refreshed like any other call.
  const publicAuthPaths = new Set(
    ["login", "refresh", "logout"].map((name) => new URL(`${root}/api/v1/auth/${name}`).pathname),
  );
  const isPublicAuthCall = (request: Request) => publicAuthPaths.has(new URL(request.url).pathname);

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
      if (!isPublicAuthCall(request)) pristine.set(request, request.clone());
      return undefined;
    },
    async onResponse({ request, response }) {
      const retry = pristine.get(request);
      if (response.status !== 401 || retry === undefined) return undefined;
      const session = await refreshSession();
      if (session === null) {
        onSessionLost?.();
        return undefined;
      }
      onSessionRenewed?.(session);
      return doFetch(retry);
    },
  });
  return Object.assign(client, { refreshSession });
}
