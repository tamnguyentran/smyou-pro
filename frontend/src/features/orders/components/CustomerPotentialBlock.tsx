import { Lightbulb, PencilLine } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { formatDateTime, formatRelativeTime } from "../../../lib/format";
import { ApiError } from "../../auth/errors";
import { useMe } from "../../me/api";
import { useCustomerPotentialNotes, useRecordCustomerPotential, type Order } from "../api";
import { CustomerPotentialSheet } from "./CustomerPotentialSheet";

const CLOSED_STATUSES = ["COMPLETED", "CANCELLED"];

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.problem.guard === "order_open_for_potential_note") {
      return "Đơn đã hoàn tất hoặc huỷ, không ghi thêm được";
    }
    if (err.problem.detail) return err.problem.detail;
  }
  return "Không thực hiện được. Vui lòng thử lại.";
}

/** AC-CUS-052…057 (M21-05b): khối "Tiềm năng sử dụng dịch vụ" dưới thông tin khách hàng trên
 * `/orders/:id`. Ai đọc được đơn thì thấy (chỉ đọc); nút "Ghi tiềm năng" chỉ khi có
 * `customer.potential.record` và đơn chưa hoàn tất/huỷ — server vẫn là nơi chặn cuối (M21-05a).
 * Khách lẻ cũ không có `customer_id` thì không có khách chủ đơn để gắn tiềm năng → ẩn khối. */
export function CustomerPotentialBlock({ order }: { order: Order }) {
  const me = useMe();
  const toast = useToast();
  const headingId = useId();
  const hasCustomer = order.customer_id !== null;
  const notes = useCustomerPotentialNotes(order.id, { enabled: hasCustomer });
  const record = useRecordCustomerPotential();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Remount the sheet on every open so a saved note never reappears in the next empty form.
  const [sheetKey, setSheetKey] = useState(0);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!hasCustomer) return null;
  const canRecord =
    me.data !== undefined &&
    "customer.potential.record" in me.data.capabilities &&
    !CLOSED_STATUSES.includes(order.status);
  const items = notes.data ?? [];
  const latest = items[0];

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-2xl bg-card p-5 shadow-card lg:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="inline-flex items-center gap-2 font-semibold text-heading">
          <Lightbulb aria-hidden="true" className="size-5 text-accent" />
          Tiềm năng sử dụng dịch vụ
        </h3>
        {canRecord ? (
          <Button
            type="button"
            variant="secondary"
            icon={<PencilLine aria-hidden="true" className="size-4" />}
            onClick={() => {
              setSheetError(null);
              setSheetKey((key) => key + 1);
              setSheetOpen(true);
            }}
          >
            Ghi tiềm năng
          </Button>
        ) : null}
      </div>

      {notes.isPending ? null : latest ? (
        <div className="space-y-1">
          <p className="text-sm break-words whitespace-pre-line text-body">{latest.note}</p>
          <p className="text-xs text-muted">
            {latest.author_name} · {formatRelativeTime(latest.created_at).toLowerCase()}
          </p>
        </div>
      ) : notes.isError ? (
        <p className="text-sm text-muted">Không tải được tiềm năng khách hàng.</p>
      ) : (
        <p className="text-sm text-muted">Chưa có ghi nhận</p>
      )}

      {items.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => {
              setHistoryOpen((open) => !open);
            }}
            className="min-h-11 text-sm font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Xem lịch sử ({items.length})
          </button>
          {historyOpen ? (
            <ul aria-label="Lịch sử tiềm năng" className="divide-y divide-line">
              {items.map((item) => (
                <li key={item.id} className="space-y-1 py-3">
                  <p className="text-sm break-words whitespace-pre-line text-body">{item.note}</p>
                  <p className="text-xs text-muted">
                    {item.author_name} · {item.order_code} · {formatDateTime(item.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <CustomerPotentialSheet
        key={sheetKey}
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
        }}
        customerName={order.customer_name ?? "Khách lẻ"}
        loading={record.isPending}
        error={sheetError}
        onConfirm={(note) => {
          setSheetError(null);
          record.mutate(
            { id: order.id, note },
            {
              onSuccess: () => {
                setSheetOpen(false);
                toast("Đã ghi tiềm năng khách hàng");
              },
              onError: (err: unknown) => {
                setSheetError(describeError(err));
              },
            },
          );
        }}
      />
    </section>
  );
}
