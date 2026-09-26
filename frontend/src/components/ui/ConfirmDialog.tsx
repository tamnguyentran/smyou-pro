import { Alert } from "./Alert";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

/** UI_GUIDELINES §6: irreversible/consequential actions state their effect before confirming. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  loading = false,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-relaxed text-body">{message}</p>
      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Huỷ
        </Button>
        <Button onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
