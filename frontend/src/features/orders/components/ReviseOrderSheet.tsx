import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";

const MIN_REASON_LENGTH = 5;

/** AC-ORD-153/154: lý do bắt buộc ≥5 ký tự — hành động không đảo ngược, khuôn giống
 * `CancelOrderSheet.tsx`. `OrderRevise.reason` là optional ở schema nhưng guard server
 * `reason_present` vẫn đòi ≥5 ký tự nên client enforce y như Huỷ/Hoàn tất. */
export function ReviseOrderSheet({
  open,
  onClose,
  orderCode,
  loading,
  error,
  staleVersion,
  onReload,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderCode: string;
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
      title={`Chuyển đơn ${orderCode} sang Chỉnh sửa?`}
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
              Xác nhận
            </Button>
          </div>
        )
      }
    >
      <p className="text-sm leading-relaxed text-body">
        Đơn sẽ chuyển sang trạng thái Chỉnh sửa và không thể hoàn tác. Vui lòng nhập lý do.
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
              label="Lý do"
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
