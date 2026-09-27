/** Client-side image validation + compression before upload (AC-CAT-016, UI_GUIDELINES dòng 84).
 * `compressImage` needs a real <canvas> (not available under jsdom/Vitest) — implemented in GREEN,
 * exercised by component tests via a mock and by the manual UAT script (spec §7).
 */

export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.85;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ImageFileErrorCode = "INVALID_FILE_TYPE" | "FILE_TOO_LARGE";

export interface ImageFileError {
  code: ImageFileErrorCode;
  message: string;
}

/** Client-detectable problems only (type, size) — mirrors the server's own Vietnamese messages
 * (files/domain.py) so the user sees the same text whether the client or the server caught it. */
export function validateImageFile(file: File): ImageFileError | null {
  if (!file.type.startsWith("image/")) {
    return { code: "INVALID_FILE_TYPE", message: "Tệp không phải ảnh hợp lệ." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { code: "FILE_TOO_LARGE", message: "Ảnh vượt quá 10MB." };
  }
  return null;
}

/** Scales width/height down so the longer edge is at most `maxEdge`, preserving aspect ratio.
 * Returns the input unchanged if it already fits. */
export function computeResizedDimensions(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Resize (canvas) + re-encode as JPEG at `JPEG_QUALITY`. Real <canvas> only — not testable in jsdom. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = computeResizedDimensions(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Không thể xử lý ảnh trên trình duyệt này.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Không thể nén ảnh."));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
