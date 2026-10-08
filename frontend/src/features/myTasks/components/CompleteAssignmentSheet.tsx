import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";

/** AC-ASG-064…066: ghi chú + giờ thực tế, cả 2 tuỳ chọn — khác `RejectAssignmentSheet.tsx`, nút
 * "Xác nhận hoàn thành" không bao giờ disabled vì không trường nào bắt buộc. */
export function CompleteAssignmentSheet({
  open,
  onClose,
  taskCode,
  estimatedHours,
  loading,
  error,
  staleVersion,
  onReload,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  taskCode: string;
  estimatedHours: string;
  loading: boolean;
  error: string | null;
  staleVersion: boolean;
  onReload: () => void;
  onConfirm: (completionNote: string, actualHours: string) => void;
}) {
  const [completionNote, setCompletionNote] = useState("");
  const [actualHours, setActualHours] = useState("");

  function reset() {
    setCompletionNote("");
    setActualHours("");
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Báo hoàn thành đầu việc ${taskCode}?`}
      dismissible={!loading}
      footer={
        staleVersion ? undefined : (
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Huỷ
            </Button>
            <Button
              type="button"
              loading={loading}
              onClick={() => {
                onConfirm(completionNote.trim(), actualHours.trim());
              }}
            >
              Xác nhận hoàn thành
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
            <Textarea
              label="Ghi chú"
              value={completionNote}
              onChange={(event) => {
                setCompletionNote(event.target.value);
              }}
            />
            <TextField
              label="Giờ thực tế"
              inputMode="decimal"
              step="0.25"
              placeholder={estimatedHours}
              value={actualHours}
              onChange={(event) => {
                setActualHours(event.target.value);
              }}
            />
          </div>
        </>
      )}
    </Sheet>
  );
}
