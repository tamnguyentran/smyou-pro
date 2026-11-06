import type { ReactNode } from "react";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

/** UI_GUIDELINES §6: irreversible/consequential actions state their effect before confirming.
 * M20-04: the caller keeps it open on any server error — `error` shows inside the dialog, and
 * `staleVersion` swaps the confirm button for "Tải lại" (same pattern as CancelOrderSheet). */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  loading = false,
  error,
  staleVersion = false,
  onReload,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  error?: ReactNode;
  staleVersion?: boolean;
  onReload?: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!loading}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          {staleVersion ? (
            <Button onClick={onReload}>Tải lại</Button>
          ) : (
            <Button onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          )}
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-body">{message}</p>
      {staleVersion ? (
        <div className="mt-3">
          <Alert>Thông tin đã bị người khác thay đổi. Vui lòng tải lại.</Alert>
        </div>
      ) : error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
    </Sheet>
  );
}
