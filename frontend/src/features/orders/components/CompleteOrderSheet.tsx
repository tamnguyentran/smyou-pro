import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { TextField } from "../../../components/ui/TextField";

/** AC-ORD-138/139/141: hành động không đảo ngược, cùng mẫu `CancelOrderSheet` (reason → tên người ký). */
export function CompleteOrderSheet({
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
  onConfirm: (signerName: string) => void;
}) {
  const [signerName, setSignerName] = useState("");
  const trimmed = signerName.trim();

  return (
    <Sheet
      open={open}
      onClose={() => {
        setSignerName("");
        onClose();
      }}
      title={`Hoàn tất đơn ${orderCode}?`}
      dismissible={!loading}
      footer={
        staleVersion ? undefined : (
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={trimmed.length === 0}
              loading={loading}
              onClick={() => {
                onConfirm(trimmed);
              }}
            >
              Xác nhận hoàn tất
            </Button>
          </div>
        )
      }
    >
      <p className="text-sm leading-relaxed text-body">
        Đơn sẽ chuyển sang trạng thái Hoàn tất và không thể hoàn tác. Vui lòng nhập tên người ký.
      </p>
      {staleVersion ? (
        <div className="mt-3 space-y-2">
          <Alert>Thông tin đã bị người khác thay đổi. Vui lòng tải lại.</Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSignerName("");
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
            <TextField
              label="Tên người ký"
              value={signerName}
              maxLength={120}
              onChange={(event) => {
                setSignerName(event.target.value);
              }}
            />
          </div>
        </>
      )}
    </Sheet>
  );
}
