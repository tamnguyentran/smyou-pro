export interface BasePaths {
  /** Vite `base`: "/" or "/smyoutask/". */
  viteBase: string;
  /** React Router `basename`: "/" or "/smyoutask". */
  routerBasename: string;
  /** Prefix for API paths ("/api/v1/..."): "" or "/smyoutask". */
  apiPrefix: string;
}

const SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Normalise BASE_PATH (ADR-014) into the three forms the app needs.
 * Throws on anything that is not a plain path, so a bad value fails the build instead of shipping.
 */
export function resolveBasePath(raw: string | undefined): BasePaths {
  const segments = (raw ?? "")
    .trim()
    .split("/")
    .filter((segment) => segment !== "");
  const invalid = segments.find((segment) => !SEGMENT.test(segment));
  if (invalid !== undefined) {
    throw new Error(
      `BASE_PATH không hợp lệ: ${JSON.stringify(raw)} — chỉ dùng đường dẫn dạng /ten-thu-muc`,
    );
  }
  if (segments.length === 0) {
    return { viteBase: "/", routerBasename: "/", apiPrefix: "" };
  }
  const path = `/${segments.join("/")}`;
  return { viteBase: `${path}/`, routerBasename: path, apiPrefix: path };
}
