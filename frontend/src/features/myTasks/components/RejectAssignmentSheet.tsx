import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import type { AssignmentRejectBody } from "../api";

const MIN_REASON_LENGTH = 5;

/** AC-ASG-037…039: lý do (1/5 mã `reject_reason_codes`) + chi tiết ≥5 ký tự, khuôn giống
 * `CancelTaskSheet.tsx`. Component thuần hiển thị: mutation điều khiển từ `MyTasksPage`. */
const REASON_OPTIONS: { value: AssignmentRejectBody["reason_code"]; label: string }[] = [
  { value: "BUSY", label: "Không đủ thời gian (đang nhiều việc)" },
  { value: "SICK", label: "Ốm đau / nghỉ phép" },
  { value: "SKILL", label: "Không phù hợp chuyên môn" },
  { value: "DISTANCE", label: "Địa điểm quá xa / không di chuyển được" },
  { value: "OTHER", label: "Lý do khác" },
];

export function RejectAssignmentSheet({
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
  onConfirm: (reasonCode: AssignmentRejectBody["reason_code"], reasonText: string) => void;
}) {
  const [reasonCode, setReasonCode] = useState<AssignmentRejectBody["reason_code"] | "">("");
  const [reasonText, setReasonText] = useState("");
  const trimmedLength = reasonText.trim().length;
  const canConfirm = reasonCode !== "" && trimmedLength >= MIN_REASON_LENGTH;

  function reset() {
    setReasonCode("");
    setReasonText("");
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Từ chối đầu việc ${taskCode}?`}
      dismissible={!loading}
      footer={
        staleVersion ? undefined : (
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={!canConfirm}
              loading={loading}
              onClick={() => {
                if (reasonCode === "") return;
                onConfirm(reasonCode, reasonText.trim());
              }}
            >
              Xác nhận từ chối
            </Button>
          </div>
        )
      }
    >
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
            <div className="mb-3">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          <div className="space-y-3">
            <Select
              label="Lý do từ chối"
              value={reasonCode}
              onChange={(event) => {
                setReasonCode(event.target.value as AssignmentRejectBody["reason_code"]);
              }}
            >
              <option value="">— Chọn lý do —</option>
              {REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Textarea
              label="Lý do chi tiết"
              value={reasonText}
              onChange={(event) => {
                setReasonText(event.target.value);
              }}
            />
          </div>
        </>
      )}
    </Sheet>
  );
}
