import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { components } from "../../lib/api/schema";
import { ApiError, toApiError, type Problem } from "../auth/errors";
import { PRODUCTS_KEY } from "../products/api";
import { SERVICES_KEY } from "../services/api";

export type ImportEntity = "products" | "services";
export type ImportPreview = components["schemas"]["ImportPreview"];
export type ImportRow = components["schemas"]["ImportRow"];

export interface EntityColumn {
  key: string;
  label: string;
}

interface EntityConfig {
  title: string;
  singular: string;
  templateFile: string;
  previewPath: "/api/v1/products/import/preview" | "/api/v1/services/import/preview";
  commitPath: "/api/v1/products/import/commit" | "/api/v1/services/import/commit";
  listKey: string;
  columns: EntityColumn[];
}

export const ENTITY_CONFIG: Record<ImportEntity, EntityConfig> = {
  products: {
    title: "Nhập sản phẩm từ CSV",
    singular: "sản phẩm",
    templateFile: "products_template.csv",
    previewPath: "/api/v1/products/import/preview",
    commitPath: "/api/v1/products/import/commit",
    listKey: PRODUCTS_KEY,
    columns: [
      { key: "sku", label: "Mã hàng" },
      { key: "name", label: "Tên" },
      { key: "category", label: "Danh mục" },
      { key: "price", label: "Giá" },
    ],
  },
  services: {
    title: "Nhập dịch vụ từ CSV",
    singular: "dịch vụ",
    templateFile: "services_template.csv",
    previewPath: "/api/v1/services/import/preview",
    commitPath: "/api/v1/services/import/commit",
    listKey: SERVICES_KEY,
    columns: [
      { key: "code", label: "Mã dịch vụ" },
      { key: "name", label: "Tên" },
      { key: "category", label: "Danh mục" },
      { key: "price", label: "Giá" },
    ],
  },
};

/** Static template files live in `frontend/public/templates/` — served relative to the Vite base
 * path (ADR-014), not the API prefix. */
export function templateUrl(entity: ImportEntity): string {
  return `${import.meta.env.BASE_URL}templates/${ENTITY_CONFIG[entity].templateFile}`;
}

const FILE_ERROR_MESSAGES: Record<string, string> & {
  TOO_MANY_ROWS: string;
  FILE_TOO_LARGE: string;
} = {
  EMPTY_FILE: "File không có dữ liệu.",
  MISSING_COLUMNS: "File thiếu cột: {detail}.",
  TOO_MANY_ROWS: "File có hơn 500 dòng, vui lòng chia nhỏ.",
  INVALID_FILE: "File không đúng định dạng CSV.",
  FILE_TOO_LARGE: "File vượt quá 2MB.",
};

/** Vietnamese copy for the file-level error codes (spec §6); falls back to the server's `detail`. */
export function fileLevelErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Không thực hiện được. Vui lòng thử lại.";
  const { code, detail } = error.problem;
  const template = code ? FILE_ERROR_MESSAGES[code] : undefined;
  if (template === "File thiếu cột: {detail}.") return `File thiếu cột: ${detail ?? ""}.`;
  return template ?? detail ?? "Không thực hiện được. Vui lòng thử lại.";
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 500;

function countDataRows(text: string): number {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
  return Math.max(0, lines.length - 1); // trừ dòng header
}

/** M2-03c (Q58): kiểm trước ở client cho đúng giới hạn server (M2-03a `MAX_FILE_BYTES`/`MAX_ROWS`),
 * tránh gọi `preview` cho file chắc chắn bị từ chối. Đếm dòng bằng cách tách `\n` nên có thể lệch với
 * `csv.DictReader` của server nếu một trường chứa newline trong ngoặc kép — server vẫn là lớp bảo vệ
 * cuối (`FILE_TOO_LARGE`/`TOO_MANY_ROWS`, xem `fileLevelErrorMessage`). */
export async function clientFileError(file: File): Promise<string | null> {
  if (file.size > MAX_FILE_BYTES) return FILE_ERROR_MESSAGES.FILE_TOO_LARGE;
  const text = await file.text();
  if (countDataRows(text) > MAX_ROWS) return FILE_ERROR_MESSAGES.TOO_MANY_ROWS;
  return null;
}

/** `IMPORT_HAS_ERRORS` (commit re-validate) rides the extra `total/valid_count/invalid_count/rows`
 * fields at the top level of the problem+json body (backend's `AppError.extra`, not modelled in the
 * OpenAPI schema since it's error-only) — read them back off the same loosely-typed `Problem`. */
export function importErrorRows(error: unknown): ImportPreview | null {
  if (!(error instanceof ApiError)) return null;
  if (error.problem.code !== "IMPORT_HAS_ERRORS") return null;
  const problem = error.problem as Problem & Partial<ImportPreview>;
  if (!Array.isArray(problem.rows)) return null;
  return {
    total: problem.total ?? problem.rows.length,
    valid_count: problem.valid_count ?? 0,
    invalid_count: problem.invalid_count ?? problem.rows.length,
    rows: problem.rows,
  };
}

function toFormData(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}

export function useImportPreview(entity: ImportEntity) {
  const { previewPath } = ENTITY_CONFIG[entity];
  return useMutation({
    mutationFn: async (file: File) => {
      const { data, error, response } = await api.POST(previewPath, {
        body: toFormData(file) as unknown as { file: string },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
  });
}

export function useImportCommit(entity: ImportEntity) {
  const { commitPath, listKey } = ENTITY_CONFIG[entity];
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { data, error, response } = await api.POST(commitPath, {
        body: toFormData(file) as unknown as { file: string },
      });
      if (!data) throw toApiError(response, error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [listKey] });
    },
  });
}
