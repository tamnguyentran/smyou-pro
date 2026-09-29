import { Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { formatCurrency } from "../../../lib/format";
import { ApiError } from "../../auth/errors";
import {
  useRemoveLine,
  useUpdateLine,
  type Order,
  type OrderLine,
  type OrderLineUpdateBody,
} from "../api";
import { computeLineTotal } from "../pricing";
import { discountFieldSchema, quantityFieldSchema } from "../schemas";
import type { RunOrderWrite } from "./writeQueue";
import { VatChipField } from "./VatChipField";

interface Draft {
  quantity: string;
  unitPrice: number;
  lineDiscount: string;
  vatRate: number;
  isGift: boolean;
}

function describeError(err: unknown): string {
  return err instanceof ApiError && err.problem.detail
    ? err.problem.detail
    : "Không thực hiện được. Vui lòng thử lại.";
}

function toDraft(line: OrderLine): Draft {
  return {
    quantity: line.quantity,
    unitPrice: line.unit_price,
    lineDiscount: String(line.line_discount),
    vatRate: Number(line.vat_rate),
    isGift: line.is_gift,
  };
}

function OrderLineRow({
  line,
  canEdit,
  runWrite,
}: {
  line: OrderLine;
  canEdit: boolean;
  runWrite: RunOrderWrite;
}) {
  // Re-derive the editable draft when the server's own fields change (a mutation settling, or a
  // background refetch) — done during render (React's documented pattern for "adjusting state when
  // a prop changes"), not in an effect, so it never causes an extra commit-then-recommit render.
  const [serverSnapshot, setServerSnapshot] = useState(line);
  const [draft, setDraft] = useState<Draft>(() => toDraft(line));
  if (
    serverSnapshot.quantity !== line.quantity ||
    serverSnapshot.unit_price !== line.unit_price ||
    serverSnapshot.vat_rate !== line.vat_rate ||
    serverSnapshot.line_discount !== line.line_discount ||
    serverSnapshot.is_gift !== line.is_gift
  ) {
    setServerSnapshot(line);
    setDraft(toDraft(line));
  }
  const [quantityError, setQuantityError] = useState<string>();
  const [discountError, setDiscountError] = useState<string>();
  const [rowError, setRowError] = useState<string>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const updateLine = useUpdateLine();
  const removeLine = useRemoveLine();
  const toast = useToast();

  const preview = computeLineTotal({
    quantity: Number(draft.quantity) || 0,
    unitPrice: draft.unitPrice,
    lineDiscount: Number(draft.lineDiscount) || 0,
    vatRate: draft.vatRate,
    isGift: draft.isGift,
  });

  function commit(patch: Omit<OrderLineUpdateBody, "version">) {
    setRowError(undefined);
    runWrite((order) =>
      updateLine.mutateAsync({
        id: order.id,
        lineId: line.id,
        body: { version: order.version, ...patch },
      }),
    ).catch((err: unknown) => {
      setDraft(toDraft(serverSnapshot));
      setRowError(describeError(err));
    });
  }

  const readOnlyPrice = line.price_fixed || draft.isGift;

  return (
    <li
      data-testid={`order-line-${line.id}`}
      className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-card p-4 lg:grid-cols-7 lg:items-center"
    >
      {rowError ? (
        <div className="col-span-2 lg:col-span-7">
          <Alert>{rowError}</Alert>
        </div>
      ) : null}
      <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1">
        <span className="font-semibold text-heading">{line.name_snapshot}</span>
        {line.price_fixed ? (
          <span title="Giá cố định" className="inline-flex items-center text-muted">
            <Lock aria-hidden="true" className="size-3.5" />
          </span>
        ) : null}
        {draft.isGift ? <Badge tone="completed">Tặng kèm</Badge> : null}
      </div>

      {canEdit ? (
        <TextField
          label="Số lượng"
          type="number"
          step="any"
          value={draft.quantity}
          error={quantityError}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft((prev) => ({ ...prev, quantity: raw }));
            const parsed = quantityFieldSchema.safeParse(raw);
            setQuantityError(parsed.success ? undefined : parsed.error.issues[0]?.message);
          }}
          onBlur={() => {
            const parsed = quantityFieldSchema.safeParse(draft.quantity);
            if (parsed.success) commit({ quantity: parsed.data });
          }}
        />
      ) : (
        <p className="text-sm text-body">{line.quantity}</p>
      )}

      {canEdit ? (
        readOnlyPrice ? (
          <TextField label="Đơn giá" type="text" readOnly value={formatCurrency(draft.unitPrice)} />
        ) : (
          <TextField
            label="Đơn giá"
            type="number"
            value={draft.unitPrice}
            onChange={(event) => {
              setDraft((prev) => ({ ...prev, unitPrice: Number(event.target.value) }));
            }}
            onBlur={() => {
              commit({ unit_price: draft.unitPrice });
            }}
          />
        )
      ) : (
        <p className="text-sm text-body">{formatCurrency(line.unit_price)}</p>
      )}

      {canEdit ? (
        <VatChipField
          value={draft.vatRate}
          onChange={(value) => {
            setDraft((prev) => ({ ...prev, vatRate: value }));
            commit({ vat_rate: value });
          }}
        />
      ) : (
        <p className="text-sm text-body">{Number(line.vat_rate)}%</p>
      )}

      {draft.isGift ? null : canEdit ? (
        <TextField
          label="Giảm giá"
          type="number"
          value={draft.lineDiscount}
          error={discountError}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft((prev) => ({ ...prev, lineDiscount: raw }));
            const parsed = discountFieldSchema.safeParse(raw);
            setDiscountError(parsed.success ? undefined : parsed.error.issues[0]?.message);
          }}
          onBlur={() => {
            const parsed = discountFieldSchema.safeParse(draft.lineDiscount);
            if (parsed.success) commit({ line_discount: parsed.data });
          }}
        />
      ) : (
        <p className="text-sm text-body">{formatCurrency(line.line_discount)}</p>
      )}

      <div className="flex min-w-0 items-center justify-between gap-3 lg:col-span-2 lg:justify-end">
        {canEdit ? (
          // A <label> (not a <span>) so the 44px padding is actually clickable/tappable, not just
          // visual spacing around the browser's fixed-size checkbox.
          <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              aria-label="Tặng kèm"
              checked={draft.isGift}
              onChange={(event) => {
                const isGift = event.target.checked;
                setDraft((prev) => ({ ...prev, isGift }));
                commit({ is_gift: isGift });
              }}
              className="size-5 rounded border-line text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            />
          </label>
        ) : (
          <span />
        )}
        <p className="shrink-0 whitespace-nowrap tabular-nums font-semibold text-heading">
          {formatCurrency(preview.line_total)}
        </p>
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            aria-label={`Xoá dòng ${line.name_snapshot}`}
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>

      {canEdit ? (
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => {
            setConfirmOpen(false);
          }}
          title="Xoá dòng hàng"
          message={`Xoá dòng ${line.name_snapshot}? Không thể hoàn tác.`}
          confirmLabel="Xoá"
          loading={removeLine.isPending}
          onConfirm={() => {
            setRowError(undefined);
            runWrite((order) =>
              removeLine.mutateAsync({ id: order.id, lineId: line.id, version: order.version }),
            )
              .then(() => {
                setConfirmOpen(false);
                toast("Đã xoá dòng hàng.");
              })
              .catch((err: unknown) => {
                setConfirmOpen(false);
                setRowError(describeError(err));
              });
          }}
        />
      ) : null}
    </li>
  );
}

/** Section 2 (AC-ORD-026..033/037): editable when the actor may edit this draft, read-only otherwise. */
export function OrderLinesSection({
  order,
  canEdit,
  onAddLine,
  runWrite,
}: {
  order: Order | undefined;
  canEdit: boolean;
  onAddLine: () => void;
  runWrite: RunOrderWrite;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-heading">Dòng hàng</h2>
        {canEdit ? (
          <Button type="button" onClick={onAddLine}>
            Thêm dòng hàng
          </Button>
        ) : null}
      </div>
      {!order || order.lines.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Chưa có dòng hàng nào.
        </p>
      ) : (
        <ul className="space-y-3">
          {order.lines.map((line) => (
            <OrderLineRow key={line.id} line={line} canEdit={canEdit} runWrite={runWrite} />
          ))}
        </ul>
      )}
    </section>
  );
}
