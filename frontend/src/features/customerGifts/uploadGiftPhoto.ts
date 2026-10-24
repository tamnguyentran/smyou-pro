import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import { ApiError, type Problem } from "../auth/errors";
import type { GiftPhoto } from "./api";

/** Tải ảnh tặng quà với tiến trình thật (AC-GFT-024) — cùng lý do với
 * `features/orders/uploadConfirmation.ts`: `openapi-fetch` không có sự kiện tiến trình tải lên. */

function uploadUrl(giftId: string): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  return `${apiPrefix}/api/v1/customer-gifts/${giftId}/photos`;
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
    form.append("file", blob, "qua-tang.jpg");
    xhr.send(form);
  });
}

export async function uploadGiftPhoto(
  giftId: string,
  blob: Blob,
  onProgress: (percent: number) => void,
): Promise<GiftPhoto> {
  const url = uploadUrl(giftId);
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
  return result.body as GiftPhoto;
}
