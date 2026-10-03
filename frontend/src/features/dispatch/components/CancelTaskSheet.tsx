import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";

const MIN_REASON_LENGTH = 5;

/** AC-DSP-067: lý do bắt buộc ≥5 ký tự — hành động không đảo ngược, khuôn giống
 * `CancelOrderSheet.tsx`. Component thuần hiển thị: mutation điều khiển từ `TaskEditSheet`. */
export function CancelTaskSheet({
  open,
  onClose,
  taskCode,
  loading,
  error,
  staleVersion,
  onReload,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  taskCode: string;
  loading: boolean;
  error: string | null;
  staleVersion: boolean;
  onReload: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const trimmedLength = reason.trim().length;

  return (
    <Sheet
      open={open}
      onClose={() => {
        setReason("");
        onClose();
      }}
      title={`Huỷ đầu việc ${taskCode}?`}
      dismissible={!loading}
      footer={
        staleVersion ? undefined : (
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={trimmedLength < MIN_REASON_LENGTH}
              loading={loading}
              onClick={() => {
                onConfirm(reason.trim());
              }}
            >
              Xác nhận huỷ
            </Button>
          </div>
        )
      }
    >
      <p className="text-sm leading-relaxed text-body">
        Đầu việc sẽ chuyển sang trạng thái Đã huỷ và không thể hoàn tác. Vui lòng nhập lý do.
      </p>
      {staleVersion ? (
        <div className="mt-3 space-y-2">
          <Alert>Thông tin đã bị người khác thay đổi. Vui lòng tải lại.</Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setReason("");
              onReload();
            }}
          >
            Tải lại
          </Button>
        </div>
      ) : (
        <>
          {error ? (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          <div className="mt-3">
            <Textarea
              label="Lý do huỷ"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </div>
        </>
      )}
    </Sheet>
  );
}
