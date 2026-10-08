import { ImageOff, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useToast } from "../../../components/ui/Toast";
import { formatDateTime } from "../../../lib/format";
import { ApiError } from "../../auth/errors";
import { compressImage, validateImageFile } from "../../products/imageCompression";
import { uploadConfirmationAttachment } from "../uploadConfirmation";
import {
  attachmentUrl,
  useConfirmationAttachments,
  type ConfirmationAttachment,
  CONFIRMATION_ATTACHMENTS_KEY,
} from "../api";
import { useQueryClient } from "@tanstack/react-query";
import type { Order } from "../api";

function AttachmentCard({ attachment }: { attachment: ConfirmationAttachment }) {
  return (
    <a
      href={attachmentUrl(attachment.id)}
      target="_blank"
      rel="noreferrer"
      className="block space-y-1 rounded-2xl border border-line bg-card p-2 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <img
        src={attachmentUrl(attachment.id)}
        alt={`Phiếu xác nhận lần chỉnh sửa #${String(attachment.revision_no)}`}
        className="aspect-square w-full rounded-xl object-cover"
      />
      <p className="text-xs font-medium text-heading">Lần chỉnh sửa #{attachment.revision_no}</p>
      <p className="text-xs text-muted">{formatDateTime(attachment.created_at)}</p>
    </a>
  );
}

/** Tab "Tệp đính kèm" (M6-01, AC-CMP-012…014): lưới ảnh phiếu xác nhận + control tải lên khi
 * `order.can_upload_confirmation && order.status === "AWAITING_CONFIRMATION"`. */
export function ConfirmationAttachmentsTab({ order }: { order: Order }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const attachments = useConfirmationAttachments(order.id);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUpload = order.can_upload_confirmation && order.status === "AWAITING_CONFIRMATION";

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
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
    try {
      const blob = await compressImage(file);
      await uploadConfirmationAttachment(order.id, blob, setProgress);
      await queryClient.invalidateQueries({ queryKey: [CONFIRMATION_ATTACHMENTS_KEY, order.id] });
      toast("Đã tải ảnh phiếu xác nhận.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? "Không thực hiện được. Vui lòng thử lại.")
          : "Không thực hiện được. Vui lòng thử lại.",
      );
    } finally {
      setProgress(null);
      setPreview(null);
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <div className="space-y-4">
      {canUpload ? (
        <div className="space-y-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading hover:bg-sidebar-sub has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2">
            <Upload aria-hidden="true" className="size-4" />
            Tải ảnh phiếu xác nhận
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={progress !== null}
              onChange={(event) => void onChange(event)}
            />
          </label>
          {preview ? (
            <img src={preview} alt="Xem trước" className="size-20 rounded-xl object-cover" />
          ) : null}
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
          {error ? <Alert>{error}</Alert> : null}
        </div>
      ) : null}

      {attachments.isPending ? (
        <div
          role="group"
          aria-busy="true"
          aria-label="Đang tải ảnh phiếu xác nhận"
          className="h-32 animate-pulse rounded-2xl bg-sidebar-sub"
        />
      ) : attachments.isError ? (
        <Alert>Không tải được danh sách ảnh.</Alert>
      ) : attachments.data.items.length === 0 ? (
        <EmptyState icon={ImageOff} message="Chưa có ảnh phiếu xác nhận." />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {attachments.data.items.map((a) => (
            <AttachmentCard key={a.id} attachment={a} />
          ))}
        </div>
      )}
    </div>
  );
}
