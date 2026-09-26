import { ApiError } from "../auth/errors";

/** Field errors keyed by field name. Unlike auth's `fieldErrors`, this trusts every message: the
 * API's validation handler (errors.py) always renders Vietnamese text for employee fields. */
export function fieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!(error instanceof ApiError)) return result;
  for (const e of error.problem.errors ?? []) {
    const message = e.message ?? "Giá trị không hợp lệ.";
    const existing = result[e.field];
    result[e.field] = existing ? `${existing} ${message}` : message;
  }
  return result;
}
