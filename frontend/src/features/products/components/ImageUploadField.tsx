import { Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { productImageUrl, type Product } from "../api";
import { compressImage, validateImageFile } from "../imageCompression";
import { uploadProductImage } from "../upload";
import { ProductImage } from "./ProductList";

/** Choose, preview, compress and upload a product image with progress (AC-CAT-016). Only rendered
 * for an existing product (create must finish first — §8 giả định) and when `canManage`. */
export function ImageUploadField({
  product,
  onUploaded,
  onBusyChange,
}: {
  product: Product;
  onUploaded: (imageAttachmentId: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again later
    if (!file) return;
    setError(null);
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem.message);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setProgress(0);
    onBusyChange?.(true);
    try {
      const blob = await compressImage(file);
      const uploaded = await uploadProductImage(product.id, blob, setProgress);
      onUploaded(uploaded.image_attachment_id);
      setPreview(null);
    } catch {
      setError("Không thực hiện được. Vui lòng thử lại.");
      setPreview(null);
    } finally {
      setProgress(null);
      onBusyChange?.(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const imageSrc =
    preview ?? (product.image_attachment_id ? productImageUrl(product.image_attachment_id) : null);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-heading">Ảnh sản phẩm</p>
      <div className="flex items-center gap-3">
        <ProductImage src={imageSrc} alt="Ảnh sản phẩm" size="size-20" />
        <div className="space-y-1">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading hover:bg-sidebar-sub">
            <Upload aria-hidden="true" className="size-4" />
            Chọn ảnh
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={progress !== null}
              onChange={(event) => void onChange(event)}
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
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
