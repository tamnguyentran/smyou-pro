export interface BasePaths {
  viteBase: string;
  routerBasename: string;
  apiPrefix: string;
}

// Stub (M0-02 red phase): always the root path.
export function resolveBasePath(_raw: string | undefined): BasePaths {
  return { viteBase: "/", routerBasename: "/", apiPrefix: "" };
}
