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
  throw new Error(`not implemented: ${file.name}`);
}

/** Scales width/height down so the longer edge is at most `maxEdge`, preserving aspect ratio.
 * Returns the input unchanged if it already fits. */
export function computeResizedDimensions(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  throw new Error(`not implemented: ${String(width)}x${String(height)}/${String(maxEdge)}`);
}

/** Resize (canvas) + re-encode as JPEG at `JPEG_QUALITY`. Real <canvas> only — not testable in jsdom. */
export async function compressImage(file: File): Promise<Blob> {
  await Promise.resolve();
  throw new Error(`not implemented: ${file.name}`);
}
