import { Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { ApiError } from "../../auth/errors";
import { productImageUrl, type Product } from "../api";
import { compressImage, validateImageFile } from "../imageCompression";
import { uploadProductImage } from "../upload";
import { ProductImage } from "./ProductList";

const GENERIC_ERROR = "Không thực hiện được. Vui lòng thử lại.";

/** The "Ảnh sản phẩm" box: preview/placeholder, "Chọn ảnh", progress and error. Validates the type
 * and size itself; a valid file goes to `onPick` — the caller decides when to upload (edit: right
 * away, AC-CAT-016; create: after the product exists, AC-CAT-112). */
export function ImagePickerField({
  imageSrc,
  progress,
  error,
  onPick,
}: {
  imageSrc: string | null;
  progress: number | null;
  error: string | null;
  onPick: (file: File) => void;
}) {
  const [pickError, setPickError] = useState<string | null>(null);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again later
    if (!file) return;
    const problem = validateImageFile(file);
    setPickError(problem?.message ?? null);
    if (!problem) onPick(file);
  };

  const shownError = pickError ?? error;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-heading">Ảnh sản phẩm</p>
      <div className="flex items-center gap-3">
        <ProductImage src={imageSrc} alt="Ảnh sản phẩm" size="size-20" caption />
        <div className="space-y-1">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading hover:bg-sidebar-sub">
            <Upload aria-hidden="true" className="size-4" />
            Chọn ảnh
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={progress !== null}
              onChange={onChange}
            />
          </label>
          {progress !== null ? (
            <div className="w-32">
              <div
                role="progressbar"
                aria-label="Đang tải ảnh"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 overflow-hidden rounded-full bg-line"
              >
                <div
                  className="h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${String(progress)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">Đang tải ảnh… {progress}%</p>
            </div>
          ) : null}
        </div>
      </div>
      {shownError ? <Alert>{shownError}</Alert> : null}
    </div>
  );
}

/** Compress + upload with progress, reporting the server's own message on failure. */
export async function compressAndUpload(
  productId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  const blob = await compressImage(file);
  const uploaded = await uploadProductImage(productId, blob, onProgress);
  return uploaded.image_attachment_id;
}

/** Choose, preview, compress and upload an existing product's image right away (AC-CAT-016).
 * `initialError` carries a failed upload over from the create form (AC-CAT-114). */
export function ImageUploadField({
  product,
  onUploaded,
  onBusyChange,
  initialError = null,
}: {
  product: Product;
  onUploaded: (imageAttachmentId: string) => void;
  onBusyChange?: (busy: boolean) => void;
  initialError?: string | null;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  const onPick = async (file: File) => {
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setProgress(0);
    onBusyChange?.(true);
    try {
      onUploaded(await compressAndUpload(product.id, file, setProgress));
    } catch (error) {
      setError(error instanceof ApiError ? (error.problem.detail ?? GENERIC_ERROR) : GENERIC_ERROR);
    } finally {
      setPreview(null);
      setProgress(null);
      onBusyChange?.(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const imageSrc =
    preview ?? (product.image_attachment_id ? productImageUrl(product.image_attachment_id) : null);

  return (
    <ImagePickerField
      imageSrc={imageSrc}
      progress={progress}
      error={error}
      onPick={(file) => void onPick(file)}
    />
  );
}
