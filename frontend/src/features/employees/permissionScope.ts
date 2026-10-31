import matrix from "./permissionMatrix.json";
import { MANAGER_BUNDLE } from "./schemas";

/** A Manager always holds the bundled roles too (M15-01), so their effective rights are the union. */
const effectiveRoles = (role: string): string[] =>
  role === "MANAGER" ? [role, ...MANAGER_BUNDLE] : [role];

/** Widest scope among the role's effective roles (all > own > assigned > self), if any. */
export function widestScope(
  capabilityRoles: Record<string, string | undefined>,
  role: string,
): string | undefined {
  const held = effectiveRoles(role).flatMap((r) =>
    capabilityRoles[r] ? [capabilityRoles[r]] : [],
  );
  return matrix.scopes.find((scope) => held.includes(scope));
}
