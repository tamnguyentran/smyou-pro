import createClient, { type Client } from "openapi-fetch";
import { resolveBasePath } from "../basePath";
import type { paths } from "./schema";

export interface ApiClientOptions {
  /** Vite base URL of the build, i.e. import.meta.env.BASE_URL ("/" or "/smyoutask/"). */
  baseUrl?: string;
  /** Page origin; defaults to window.location.origin. */
  origin?: string;
  fetch?: typeof globalThis.fetch;
}

/** Typed client for the backend; API paths are resolved under the app's BASE_PATH (ADR-014). */
export function createApiClient(options: ApiClientOptions = {}): Client<paths> {
  const { baseUrl = import.meta.env.BASE_URL, origin = window.location.origin, fetch } = options;
  const { apiPrefix } = resolveBasePath(baseUrl);
  return createClient<paths>({
    baseUrl: `${origin}${apiPrefix}`,
    ...(fetch === undefined ? {} : { fetch }),
  });
}
