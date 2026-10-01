import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../components/ui/Toast";
import { cn } from "../../../lib/cn";
import { ApiError } from "../../auth/errors";
import { useCancelOrder, useRecallOrder, type Order, type OrderCancelBody } from "../api";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type OrderStatus } from "../orderStatus";
import { AddLineSheet } from "./AddLineSheet";
import { CancelOrderSheet } from "./CancelOrderSheet";
import { EditContactSheet } from "./EditContactSheet";
import { OrderHistoryTab } from "./OrderHistoryTab";
import { OrderInfoTab } from "./OrderInfoTab";
import { OrderLinesSection } from "./OrderLinesSection";
import { OrderTotalsSection } from "./OrderTotalsSection";
import type { RunOrderWrite } from "./writeQueue";

const TABS = [
  { id: "info", label: "Thông tin" },
  { id: "lines", label: "Dòng hàng" },
  { id: "history", label: "Lịch sử" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function describeError(err: unknown): string {
  return err instanceof ApiError && err.problem.detail
    ? err.problem.detail
    : "Không thực hiện được. Vui lòng thử lại.";
}

/** `/orders/:id` khi `status != DRAFT` (spec §6) — chỉ đọc trừ khi `can_edit_contact`/
 * `can_edit_lines_after_submit` (M3-04b), hành động theo `allowed_commands`. `onReload` re-fetches
 * the order from the parent's query (AC-ORD-070's "Tải lại" after a STALE_VERSION cancel);
 * `runWrite` is the same per-order write queue `DraftOrderForm` already owns (writeQueue.ts) — reused
 * here instead of a second queue, so a contact/line edit can never race the order's `version`. */
export function OrderDetailTabs({
  order,
  onReload,
  runWrite,
}: {
  order: Order;
  onReload: () => void;
  runWrite: RunOrderWrite;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("info");
  const [recallOpen, setRecallOpen] = useState(false);
  const [recallError, setRecallError] = useState<string | null>(null);
  const [recallStale, setRecallStale] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelStale, setCancelStale] = useState(false);
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [linesStale, setLinesStale] = useState(false);
  const recallOrder = useRecallOrder();
  const cancelOrder = useCancelOrder();

  const canRecall = order.allowed_commands.includes("recall");
  const canCancel = order.allowed_commands.includes("cancel");
  const status = order.status as OrderStatus;

  function submitRecall() {
    setRecallError(null);
    recallOrder.mutate(
      { id: order.id, version: order.version },
      {
        onSuccess: (updated) => {
          setRecallOpen(false);
          toast(`Đã thu hồi đơn ${updated.code}.`);
        },
        onError: (err: unknown) => {
          if (err instanceof ApiError && err.problem.code === "STALE_VERSION") {
            setRecallOpen(false);
            setRecallStale(true);
          } else {
            setRecallError(describeError(err));
          }
        },
      },
    );
  }

  function submitCancel(reason: string) {
    setCancelError(null);
    const body: OrderCancelBody = { version: order.version, reason };
    cancelOrder.mutate(
      { id: order.id, body },
      {
        onSuccess: (updated) => {
          setCancelOpen(false);
          toast(`Đã huỷ đơn ${updated.code}.`);
        },
        onError: (err: unknown) => {
          if (err instanceof ApiError && err.problem.code === "STALE_VERSION") {
            setCancelStale(true);
          } else {
            setCancelError(describeError(err));
          }
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      {recallStale ? (
        <div className="space-y-2">
          <Alert>Thông tin đã bị người khác thay đổi. Vui lòng tải lại.</Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setRecallStale(false);
              onReload();
            }}
          >
            Tải lại
          </Button>
        </div>
      ) : null}
      {linesStale ? (
        <div className="space-y-2">
          <Alert>Thông tin đã bị người khác thay đổi. Vui lòng tải lại.</Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setLinesStale(false);
              onReload();
            }}
          >
            Tải lại
          </Button>
        </div>
      ) : null}
      <header className="sticky top-0 z-10 space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card lg:flex lg:items-center lg:justify-between lg:gap-4 lg:space-y-0">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-heading">{order.code}</p>
            <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
          </div>
          <p className="text-sm text-body">{order.customer_name ?? "Khách lẻ"}</p>
        </div>
        {canRecall || canCancel ? (
          <div
            data-testid="order-detail-actions"
            className="sticky bottom-16 z-10 flex gap-3 bg-page py-3 lg:static lg:bottom-auto lg:bg-transparent lg:py-0"
          >
            {canRecall ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRecallOpen(true);
                }}
              >
                Thu hồi
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCancelOpen(true);
                }}
              >
                Huỷ đơn
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div role="tablist" aria-label="Chi tiết đơn" className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
            }}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition duration-200",
              tab === t.id
                ? "border-brand bg-brand text-white"
                : "border-line bg-card text-body hover:bg-sidebar-sub",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "info" ? (
          <OrderInfoTab
            order={order}
            onEditContact={
              order.can_edit_contact
                ? () => {
                    setEditContactOpen(true);
                  }
                : undefined
            }
          />
        ) : null}
        {tab === "lines" ? (
          <div className="space-y-4">
            <OrderLinesSection
              order={order}
              canEdit={order.can_edit_lines_after_submit}
              lineEndpoint="after-submit"
              onAddLine={() => {
                setAddLineOpen(true);
              }}
              runWrite={runWrite}
              onStaleVersion={() => {
                setLinesStale(true);
              }}
            />
            <OrderTotalsSection order={order} />
          </div>
        ) : null}
        {tab === "history" ? <OrderHistoryTab orderId={order.id} /> : null}
      </div>

      <ConfirmDialog
        open={recallOpen}
        onClose={() => {
          setRecallOpen(false);
        }}
        title="Thu hồi đơn?"
        message={`Thu hồi đơn ${order.code} về Nháp để sửa tiếp?`}
        confirmLabel="Thu hồi"
        loading={recallOrder.isPending}
        error={recallError}
        onConfirm={submitRecall}
      />
      <CancelOrderSheet
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
          setCancelError(null);
        }}
        orderCode={order.code}
        loading={cancelOrder.isPending}
        error={cancelError}
        staleVersion={cancelStale}
        onReload={() => {
          setCancelStale(false);
          setCancelOpen(false);
          onReload();
        }}
        onConfirm={submitCancel}
      />
      {editContactOpen ? (
        <EditContactSheet
          order={order}
          onClose={() => {
            setEditContactOpen(false);
          }}
          onReload={() => {
            setEditContactOpen(false);
            onReload();
          }}
        />
      ) : null}
      {addLineOpen ? (
        <AddLineSheet
          onClose={() => {
            setAddLineOpen(false);
          }}
          runOrderWrite={runWrite}
          lineEndpoint="after-submit"
          onStaleVersion={() => {
            setLinesStale(true);
          }}
        />
      ) : null}
    </div>
  );
}
