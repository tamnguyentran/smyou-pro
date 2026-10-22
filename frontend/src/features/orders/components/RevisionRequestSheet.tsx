import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";

/** M15-03 (AC-CSK-020/021): ô mô tả điền sẵn = `csat_comment` hiện tại, CSKH sửa/thêm trước khi
 * gửi. Không có `version`/stale-version ở đây — thao tác chỉ ghi audit_event + notification,
 * không sửa chính hàng `orders` (khác `ReviseOrderSheet.tsx`, khối của QLKT). */
export function RevisionRequestSheet({
  open,
  onClose,
  orderCode,
  defaultNote,
  loading,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderCode: string;
  defaultNote: string;
  loading: boolean;
  error: string | null;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState(defaultNote);
  // "Adjusting state when a prop changes" (react.dev) trong lúc render, không phải useEffect —
  // re-sync từ `defaultNote` mỗi lần mở lại, bất kể lần trước đóng qua nút "Huỷ", Esc, backdrop,
  // hay sau khi gửi thành công (review: đóng bằng những đường khác nhau không được bỏ qua reset).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setNote(defaultNote);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Tạo yêu cầu chỉnh sửa đơn ${orderCode}`}
      dismissible={!loading}
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button
            type="button"
            disabled={note.trim().length === 0}
            loading={loading}
            onClick={() => {
              onConfirm(note.trim());
            }}
          >
            Gửi yêu cầu
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-body">
        Gửi tới Quản lý kỹ thuật để xem xét mở lại xử lý. Đơn vẫn giữ nguyên trạng thái Hoàn tất cho
        tới khi Quản lý kỹ thuật quyết định.
      </p>
      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="mt-3">
        <Textarea
          label="Mô tả"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </div>
    </Sheet>
  );
}
