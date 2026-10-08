import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import { ApiError, type Problem } from "../auth/errors";
import type { ConfirmationAttachment } from "./api";

/** Uploads a confirmation-slip photo with real progress (AC-CMP-012, mirrors products/upload.ts —
 * `openapi-fetch`'s wrapped `fetch` has no upload-progress event, so this goes through a raw
 * XMLHttpRequest instead of `api`). */

function uploadUrl(orderId: string): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  return `${apiPrefix}/api/v1/orders/${orderId}/confirmation-attachments`;
}

function send(
  url: string,
  blob: Blob,
  onProgress: (percent: number) => void,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => {
      reject(new Error("Lỗi kết nối khi tải ảnh."));
    };
    const form = new FormData();
    form.append("file", blob, "phieu-xac-nhan.jpg");
    xhr.send(form);
  });
}

/** Same contract as the typed client's own 401 handling (client.ts): one shared refresh, one retry. */
export async function uploadConfirmationAttachment(
  orderId: string,
  blob: Blob,
  onProgress: (percent: number) => void,
): Promise<ConfirmationAttachment> {
  const url = uploadUrl(orderId);
  let result = await send(url, blob, onProgress);
  if (result.status === 401) {
    const session = await api.refreshSession();
    if (session) result = await send(url, blob, onProgress);
  }
  if (result.status !== 200 && result.status !== 201) {
    const problem =
      typeof result.body === "object" && result.body !== null
        ? (result.body as Partial<Problem>)
        : {};
    throw new ApiError({ ...problem, status: result.status });
  }
  return result.body as ConfirmationAttachment;
}
