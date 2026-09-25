import type { Client } from "openapi-fetch";
import type { paths } from "./schema";

export interface ApiClientOptions {
  /** Vite base URL of the build, i.e. import.meta.env.BASE_URL ("/" or "/smyoutask/"). */
  baseUrl?: string;
  /** Page origin; defaults to window.location.origin. */
  origin?: string;
  fetch?: typeof globalThis.fetch;
}

// Stub (M0-02 red phase).
export function createApiClient(_options: ApiClientOptions = {}): Client<paths> {
  throw new Error("not implemented");
}
