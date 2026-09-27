/** Uploads a product image with real progress (AC-CAT-016). `openapi-fetch`'s wrapped `fetch` has no
 * upload-progress event, so this one call goes through a raw XMLHttpRequest instead of `api`. */

export interface UploadedImage {
  image_attachment_id: string;
}

export async function uploadProductImage(
  productId: string,
  blob: Blob,
  onProgress: (percent: number) => void,
): Promise<UploadedImage> {
  await Promise.resolve();
  onProgress(0);
  throw new Error(`not implemented: ${productId}, ${String(blob.size)} bytes`);
}
