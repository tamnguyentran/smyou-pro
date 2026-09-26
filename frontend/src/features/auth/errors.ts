/** problem+json from the API (ARCHITECTURE §4) turned into what forms display. */
export interface Problem {
  status: number;
  code?: string;
  detail?: string;
  errors?: { field: string; code?: string; message?: string }[];
}

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? `HTTP ${String(problem.status)}`);
  }
}

/** `body` is the error openapi-fetch already parsed (the response body can only be read once). */
export function toApiError(response: Response, body: unknown): ApiError {
  const problem = typeof body === "object" && body !== null ? (body as Partial<Problem>) : {};
  return new ApiError({ ...problem, status: response.status });
}

const GENERIC_FIELD = "Giá trị không hợp lệ.";
const GENERIC_FORM = "Không thực hiện được. Vui lòng thử lại.";

/** Field errors keyed by field name. Our domain rules carry Vietnamese messages (code "invalid");
 * framework validation messages are English, so those get a generic Vietnamese text. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(
    (error.problem.errors ?? []).map((e) => [
      e.field,
      e.code === "invalid" && e.message ? e.message : GENERIC_FIELD,
    ]),
  );
}

export function formError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError && error.problem.errors?.length) return null;
  return error instanceof ApiError && error.problem.detail ? error.problem.detail : GENERIC_FORM;
}
