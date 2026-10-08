import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";

const MIN_REASON_LENGTH = 5;

/** AC-DSP-122/123: lý do bắt buộc ≥5 ký tự + mức độ lỗi bắt buộc chọn — hành động không đảo
 * ngược, khuôn giống `CancelTaskSheet.tsx` cộng `Select` mức độ lỗi (`TaskReopen.severity`). */
export function ReopenTaskSheet({
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
  onConfirm: (reason: string, severity: "MINOR" | "MAJOR") => void;
}) {
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<"" | "MINOR" | "MAJOR">("");
  const trimmedLength = reason.trim().length;

  function reset() {
    setReason("");
    setSeverity("");
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Mở lại đầu việc ${taskCode}?`}
      dismissible={!loading}
      footer={
        staleVersion ? undefined : (
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={trimmedLength < MIN_REASON_LENGTH || severity === ""}
              loading={loading}
              onClick={() => {
                if (severity === "") return;
                onConfirm(reason.trim(), severity);
              }}
            >
              Xác nhận mở lại
            </Button>
          </div>
        )
      }
    >
      <p className="text-sm leading-relaxed text-body">Đầu việc sẽ mở lại và không thể hoàn tác.</p>
      <p className="mt-1 text-sm leading-relaxed text-body">
        Hệ thống sẽ ghi nhận lỗi cho (những) người đã làm.
      </p>
      {staleVersion ? (
        <div className="mt-3 space-y-2">
          <Alert>Thông tin đã bị người khác thay đổi. Vui lòng tải lại.</Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reset();
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
          <div className="mt-3 space-y-3">
            <Textarea
              label="Lý do"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            <Select
              label="Mức độ lỗi"
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value as "" | "MINOR" | "MAJOR");
              }}
            >
              <option value="" disabled>
                Chọn mức độ
              </option>
              <option value="MINOR">Nhẹ</option>
              <option value="MAJOR">Nặng</option>
            </Select>
          </div>
        </>
      )}
    </Sheet>
  );
}
