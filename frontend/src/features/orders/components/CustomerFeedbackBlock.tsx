import { Star } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Textarea } from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/Toast";
import { cn } from "../../../lib/cn";
import { ApiError } from "../../auth/errors";
import { useMe } from "../../me/api";
import { useRecordCsat, type Order } from "../api";

function describeError(err: unknown): string {
  return err instanceof ApiError && err.problem.detail
    ? err.problem.detail
    : "Không thực hiện được. Vui lòng thử lại.";
}

function StarPicker({
  value,
  onChange,
  readOnly,
}: {
  value: number;
  onChange: (rating: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Số sao" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${String(n)} sao`}
          disabled={readOnly}
          onClick={() => {
            onChange(n);
          }}
          className="flex min-h-11 min-w-11 items-center justify-center disabled:cursor-default"
        >
          <Star
            aria-hidden="true"
            className={cn("size-6", value >= n ? "fill-accent text-accent" : "text-line")}
          />
        </button>
      ))}
    </div>
  );
}

/** AC-CSK-013...017 (M15-02b): khối "Phản hồi khách hàng" trên `/orders/:id`, chỉ khi
 * `order.status === "COMPLETED"`. `customer_care.manage_feedback` (CUSTOMER_CARE/MANAGER) → form sửa
 * được; vai trò khác chỉ thấy chỉ-đọc khi đã có phản hồi, ẩn hoàn toàn nếu chưa có (Q91). */
export function CustomerFeedbackBlock({ order }: { order: Order }) {
  const me = useMe();
  const toast = useToast();
  const recordCsat = useRecordCsat();
  const [rating, setRating] = useState(order.csat_rating ?? 0);
  const [comment, setComment] = useState(order.csat_comment ?? "");
  const [error, setError] = useState<string | null>(null);

  if (order.status !== "COMPLETED") return null;
  const canManage = me.data ? "customer_care.manage_feedback" in me.data.capabilities : false;
  if (!canManage && order.csat_rating === null) return null;

  if (!canManage) {
    return (
      <div className="space-y-3 rounded-2xl bg-card p-5 shadow-card">
        <h3 className="font-semibold text-heading">Phản hồi khách hàng</h3>
        <StarPicker value={order.csat_rating ?? 0} onChange={() => undefined} readOnly />
        <p className="text-sm text-body">{order.csat_comment}</p>
      </div>
    );
  }

  const hasExisting = order.csat_rating !== null;
  const canSave = rating > 0 && comment.trim().length > 0;

  function submit() {
    setError(null);
    recordCsat.mutate(
      {
        id: order.id,
        body: { version: order.version, csat_rating: rating, csat_comment: comment },
      },
      {
        onSuccess: () => {
          toast("Đã lưu phản hồi của khách hàng.");
        },
        onError: (err: unknown) => {
          setError(describeError(err));
        },
      },
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-card p-5 shadow-card">
      <h3 className="font-semibold text-heading">Phản hồi khách hàng</h3>
      <StarPicker value={rating} onChange={setRating} />
      <Textarea
        label="Nội dung phản hồi"
        placeholder="Nhập nội dung phản hồi của khách hàng…"
        value={comment}
        onChange={(event) => {
          setComment(event.target.value);
        }}
      />
      {error ? <p className="text-sm font-medium text-urgent-fg">{error}</p> : null}
      <Button type="button" disabled={!canSave} loading={recordCsat.isPending} onClick={submit}>
        {hasExisting ? "Cập nhật phản hồi" : "Lưu phản hồi"}
      </Button>
    </div>
  );
}
