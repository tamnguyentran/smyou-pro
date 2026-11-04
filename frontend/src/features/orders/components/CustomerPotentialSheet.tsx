import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";

// Same bound as `customer_potential_notes.note` (M21-05a §5).
const MAX_NOTE_LENGTH = 1000;

/** AC-CUS-053…055 (M21-05b): ô ghi tiềm năng. Component thuần hiển thị — mutation điều khiển từ
 * `CustomerPotentialBlock`; `error` (lỗi server) giữ modal mở (M20-04). */
export function CustomerPotentialSheet({
  open,
  onClose,
  customerName,
  loading,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  customerName: string;
  loading: boolean;
  error: string | null;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

  function close() {
    setNote("");
    setFieldError(undefined);
    onClose();
  }

  function save() {
    const trimmed = note.trim();
    if (trimmed.length === 0) {
      setFieldError("Vui lòng nhập nội dung");
      return;
    }
    if (trimmed.length > MAX_NOTE_LENGTH) {
      setFieldError(`Tối đa ${String(MAX_NOTE_LENGTH)} ký tự`);
      return;
    }
    setFieldError(undefined);
    onConfirm(trimmed);
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={`Tiềm năng sử dụng dịch vụ — ${customerName}`}
      dismissible={!loading}
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={close} disabled={loading}>
            Huỷ
          </Button>
          <Button type="button" loading={loading} onClick={save}>
            Lưu
          </Button>
        </div>
      }
    >
      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <Textarea
        label="Nội dung"
        rows={5}
        placeholder="VD: Khách muốn lắp thêm camera kho, hỏi giá máy in màu…"
        value={note}
        error={fieldError}
        hint={`${String(note.length)}/${String(MAX_NOTE_LENGTH)}`}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
    </Sheet>
  );
}
