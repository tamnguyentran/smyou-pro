import { api } from "../../lib/api";
import { resolveBasePath } from "../../lib/basePath";
import { ApiError, type Problem } from "../auth/errors";

/** Uploads a product image with real progress (AC-CAT-016). `openapi-fetch`'s wrapped `fetch` has no
 * upload-progress event, so this one call goes through a raw XMLHttpRequest instead of `api`. */

export interface UploadedImage {
  image_attachment_id: string;
}

function imageUrl(productId: string): string {
  const apiPrefix = resolveBasePath(import.meta.env.BASE_URL).apiPrefix;
  return `${apiPrefix}/api/v1/products/${productId}/image`;
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
    form.append("file", blob, "product-image.jpg");
    xhr.send(form);
  });
}

/** Same contract as the typed client's own 401 handling (client.ts): one shared refresh, one retry. */
export async function uploadProductImage(
  productId: string,
  blob: Blob,
  onProgress: (percent: number) => void,
): Promise<UploadedImage> {
  const url = imageUrl(productId);
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
  return result.body as UploadedImage;
}
