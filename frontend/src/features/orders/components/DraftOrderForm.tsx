import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { useNavigate } from "react-router";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { NotFoundPage } from "../../../app/shell/StatusPage";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { ChipGroup } from "../../../components/ui/Chip";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Select } from "../../../components/ui/Select";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { formatCurrency } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { ApiError } from "../../auth/errors";
import { useMe } from "../../me/api";
import {
  useCancelOrder,
  useCreateOrder,
  useOrder,
  useSubmitOrder,
  useUpdateOrder,
  type Order,
  type OrderCreateBody,
} from "../api";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  orderInfoSchema,
  type OrderInfoFormValues,
  type Priority,
} from "../schemas";
import { useActiveProductServiceGroups } from "../../productServiceGroups/api";
import { AddLineSheet } from "./AddLineSheet";
import { CancelOrderSheet } from "./CancelOrderSheet";
import { CustomerPicker } from "./CustomerPicker";
import { OrderDetailTabs } from "./OrderDetailTabs";
import { OrderLinesSection } from "./OrderLinesSection";
import { OrderTotalsSection } from "./OrderTotalsSection";
import { ReadOnlyField } from "./ReadOnlyField";
import { useOrderWriteQueue } from "./writeQueue";

// Matches Tailwind's `lg:` breakpoint (and AppShell's own desktop/mobile split) — AC-ORD-038's
// accordion is mobile-only, Section 1 is always expanded at this width and above.
const DESKTOP = "(min-width: 1024px)";

const BLANK_VALUES: OrderInfoFormValues = {
  customerMode: "search",
  customer_id: "",
  customer_name: "",
  customer_phone: "",
  division_id: "",
  service_address: "",
  work_description: "",
  priority: "NORMAL",
  requested_date: "",
};

function mapOrderToFormValues(order: Order): OrderInfoFormValues {
  return {
    customerMode: order.customer_id || !order.customer_name ? "search" : "walkin",
    customer_id: order.customer_id ?? "",
    customer_name: order.customer_name ?? "",
    customer_phone: order.customer_phone ?? "",
    division_id: order.division_id ?? "",
    service_address: order.service_address,
    work_description: order.work_description,
    priority: order.priority as Priority,
    requested_date: order.requested_date ?? "",
  };
}

function buildOrderFields(values: OrderInfoFormValues): Omit<OrderCreateBody, "payment_status"> {
  return {
    customer_id: values.customerMode === "search" ? values.customer_id || null : null,
    customer_name: values.customerMode === "walkin" ? values.customer_name || null : null,
    customer_phone: values.customerMode === "walkin" ? values.customer_phone || null : null,
    division_id: values.division_id || null,
    service_address: values.service_address || null,
    work_description: values.work_description || null,
    priority: values.priority,
    requested_date: values.requested_date || null,
  };
}

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải đơn hàng"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** `/orders/new` and `/orders/:id` share this component (spec §6). */
export function DraftOrderForm({ orderId }: { orderId?: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const me = useMe();
  const [id, setIdState] = useState(orderId);
  // A ref alongside the state: queued write steps (see writeQueue.ts) run later, asynchronously, and
  // must see the id a *just-finished* step set — not the value their own closure was created with.
  const idRef = useRef(id);
  function setId(newId: string) {
    idRef.current = newId;
    setIdState(newId);
  }
  const orderQuery = useOrder(id);
  const order = orderQuery.data;
  const groups = useActiveProductServiceGroups();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const submitOrder = useSubmitOrder();
  const cancelOrder = useCancelOrder();
  // Serializes this save against every line edit (see writeQueue.ts) — a "Giảm giá" blur and "Lưu
  // nháp" both PATCH with the order's current `version`, and firing both at once would make
  // whichever lands second fail with a spurious STALE_VERSION, since it wasn't really a different actor.
  const { enqueue, currentOrder, runWrite } = useOrderWriteQueue(() => idRef.current);

  const [staleVersion, setStaleVersion] = useState(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelStale, setCancelStale] = useState(false);
  // AC-ORD-167..169: "Huỷ đơn" chỉ enable khi đơn đã *thật sự* được lưu — nháp tạo ngầm qua "Thêm
  // dòng hàng" (createDraft) không tính. "/orders/new" và "/orders/:id" dùng chung 1 route/1 instance
  // (routes.tsx) — `orderId` prop đổi giá trị ngay trong đời sống component khi createDraft() điều
  // hướng, nên phải chụp giá trị ban đầu (mount-time) để biết đơn có *sẵn từ trước* hay không, không
  // dùng trực tiếp `orderId` (nó sẽ lên "true" ngay sau khi tạo nháp ngầm, dù chưa ai bấm Lưu nháp).
  const [openedExistingOrder] = useState(() => Boolean(orderId));
  const [savedOnce, setSavedOnce] = useState(false);
  // AC-ORD-038: on mobile, Section 1 collapses into an accordion (never "Dòng hàng"). Open by
  // default when starting a brand-new order (there's nothing to collapse yet); collapsed by default
  // when reopening an already-saved one, since the focus there is usually "Dòng hàng". Keyed off the
  // route's own `orderId` prop, not the mutable `id` state, so the first autosave-on-add-line
  // (new → real id, same session) doesn't yank this shut mid-edit.
  const [section1Open, setSection1Open] = useState(() => !orderId);
  const isDesktop = useMediaQuery(DESKTOP, true);

  const { register, handleSubmit, watch, setValue, getValues, reset, formState, control } =
    useForm<OrderInfoFormValues>({
      resolver: zodResolver(orderInfoSchema) as Resolver<OrderInfoFormValues>,
      defaultValues: BLANK_VALUES,
    });
  const priority = useWatch({ control, name: "priority" });
  const [customerMode, customerId, customerName, customerPhone] = useWatch({
    control,
    name: ["customerMode", "customer_id", "customer_name", "customer_phone"],
  });
  // AC-ORD-158..165: tính hoàn toàn từ state form hiện có, không gọi thêm API (spec M10-02 §6).
  const hasCustomer =
    customerMode === "search"
      ? Boolean(customerId)
      : (customerName ?? "").trim() !== "" && (customerPhone ?? "").trim() !== "";
  const hasLine = (order?.lines.length ?? 0) >= 1;
  const canSave = hasCustomer && hasLine;
  const missingInfoHint =
    !hasCustomer && !hasLine
      ? "Cần chọn khách hàng và thêm ít nhất 1 dòng hàng để lưu đơn."
      : !hasCustomer
        ? "Cần chọn khách hàng."
        : !hasLine
          ? "Cần thêm ít nhất 1 dòng hàng."
          : null;
  const canCancel = openedExistingOrder || savedOnce;

  const loadedOrderId = order?.id;
  useEffect(() => {
    // Keyed on the id alone, not `order`/`reset` (both change identity on every cache update from a
    // line edit) — resetting there too would wipe Section 1 input the user hasn't saved yet.
    if (loadedOrderId !== undefined && order) reset(mapOrderToFormValues(order));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: intentionally id-only
  }, [loadedOrderId]);

  usePageTitle(!id ? "Tạo đơn mới" : (order?.code ?? "Đơn hàng"));

  /** Creates the draft if it doesn't exist yet, using whatever Section 1 currently holds (spec §8),
   * queued behind any other pending order write. */
  async function createDraft(): Promise<Order> {
    const created = await createOrder.mutateAsync({
      ...buildOrderFields(getValues()),
      payment_status: "UNPAID",
    });
    setId(created.id);
    void navigate(`/orders/${created.id}`, { replace: true });
    return created;
  }

  /** Passed to AddLineSheet: run `task` against the order, creating it first if this is the very
   * first line — both steps count as one queued write. */
  function runWriteOrCreate(task: (current: Order) => Promise<Order>): Promise<Order> {
    return enqueue(async () => task(currentOrder() ?? (await createDraft())));
  }

  // react-hook-form's handleSubmit must be constructed at render time (that's its documented API);
  // the ref inside `enqueue` (via useOrderWriteQueue) is only ever dereferenced later, inside the
  // async callback the resulting handler runs on submit — never synchronously during this render.
  // eslint-disable-next-line react-hooks/refs -- see comment above
  const onSave = handleSubmit((values) =>
    enqueue(async () => {
      setFormError(null);
      try {
        const current = currentOrder();
        const saved = current
          ? await updateOrder.mutateAsync({
              id: current.id,
              body: { version: current.version, ...buildOrderFields(values) },
            })
          : await createDraft();
        setSavedOnce(true);
        toast(`Đã lưu nháp ${saved.code}.`);
      } catch (err) {
        if (err instanceof ApiError && err.problem.code === "STALE_VERSION") {
          setStaleVersion(true);
        } else {
          setFormError("Không thực hiện được. Vui lòng thử lại.");
        }
      }
    }),
  );

  async function doReload() {
    const fresh = await orderQuery.refetch();
    if (fresh.data) reset(mapOrderToFormValues(fresh.data));
    setStaleVersion(false);
    setReloadConfirmOpen(false);
  }

  /** AC-ORD-061/062: submit guard failures stay on this form as a banner (order data untouched). */
  function doSubmit() {
    if (!order) return;
    setSubmitError(null);
    submitOrder.mutate(
      { id: order.id, version: order.version },
      {
        onSuccess: (updated) => {
          setSubmitOpen(false);
          toast(`Đã gửi đơn ${updated.code}.`);
        },
        onError: (err: unknown) => {
          setSubmitOpen(false);
          if (err instanceof ApiError && err.problem.code === "STALE_VERSION") {
            setStaleVersion(true);
          } else {
            setSubmitError(
              err instanceof ApiError && err.problem.detail
                ? err.problem.detail
                : "Không thực hiện được. Vui lòng thử lại.",
            );
          }
        },
      },
    );
  }

  /** AC-ORD-063: huỷ đơn nháp — điều hướng về /orders sau khi thành công. */
  function doCancel(reason: string) {
    if (!order) return;
    setCancelError(null);
    cancelOrder.mutate(
      { id: order.id, body: { version: order.version, reason } },
      {
        onSuccess: (updated) => {
          setCancelOpen(false);
          toast(`Đã huỷ đơn ${updated.code}.`);
          void navigate("/orders");
        },
        onError: (err: unknown) => {
          if (err instanceof ApiError && err.problem.code === "STALE_VERSION") {
            setCancelStale(true);
          } else {
            setCancelError(
              err instanceof ApiError && err.problem.detail
                ? err.problem.detail
                : "Không thực hiện được. Vui lòng thử lại.",
            );
          }
        },
      },
    );
  }

  if (id && orderQuery.isPending) return <Waiting />;
  if (id && orderQuery.isError) {
    // AC-ORD-068: out-of-scope (e.g. a TECHNICIAN with no assignment) gets a plain 404 from the API.
    if (orderQuery.error instanceof ApiError && orderQuery.error.problem.status === 404) {
      return <NotFoundPage />;
    }
    return <p className="text-sm text-body">Không tải được đơn hàng.</p>;
  }

  if (order && order.status !== "DRAFT") {
    return (
      <OrderDetailTabs
        order={order}
        onReload={() => void orderQuery.refetch()}
        runWrite={runWrite}
      />
    );
  }

  const scopes = me.data?.capabilities["order.edit_draft"] ?? [];
  const canEdit =
    !order ||
    scopes.includes("all") ||
    (scopes.includes("own") && order.created_by === me.data?.employee.id);
  const showSection1 = isDesktop || section1Open;
  // Read during render, not only inside the "Tải lại" callback below — react-hook-form's formState
  // is a Proxy that only stays reactive for fields it saw accessed while rendering.
  const isDirty = formState.isDirty;

  return (
    <div data-testid="draft-order-layout" className="grid gap-6 lg:grid-cols-2">
      <form
        id="draft-order-form"
        noValidate
        onSubmit={(event) => void onSave(event)}
        className="space-y-6 lg:col-start-1 lg:row-start-1"
      >
        {formError ? <Alert>{formError}</Alert> : null}
        {submitError ? <Alert>{submitError}</Alert> : null}
        {staleVersion ? (
          <div className="space-y-2">
            <Alert>Thông tin đã bị người khác thay đổi. Vui lòng tải lại.</Alert>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (isDirty) setReloadConfirmOpen(true);
                else void doReload();
              }}
            >
              Tải lại
            </Button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setSection1Open((prev) => !prev);
          }}
          aria-expanded={section1Open}
          aria-controls="draft-order-section1"
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 text-left text-sm font-semibold text-heading lg:hidden"
        >
          <span>Thông tin đơn</span>
          {section1Open ? (
            <ChevronUp aria-hidden="true" className="size-4 shrink-0 text-muted" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted" />
          )}
        </button>

        <div id="draft-order-section1" hidden={!showSection1} className="space-y-6">
          {canEdit ? (
            <>
              <CustomerPicker
                register={register}
                watch={watch}
                setValue={setValue}
                errors={formState.errors}
              />
              <Select
                label="Phòng phụ trách"
                error={formState.errors.division_id?.message}
                {...register("division_id")}
              >
                <option value="">—</option>
                {(groups.data ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
              <TextField
                label="Địa chỉ thi công"
                error={formState.errors.service_address?.message}
                {...register("service_address")}
              />
              <Textarea
                label="Mô tả công việc"
                error={formState.errors.work_description?.message}
                {...register("work_description")}
              />
              <ChipGroup
                label="Độ ưu tiên"
                value={priority}
                options={PRIORITY_ORDER.map((priority) => ({
                  value: priority,
                  label: PRIORITY_LABELS[priority],
                }))}
                onChange={(value) => {
                  setValue("priority", value, { shouldDirty: true });
                }}
              />
              <TextField
                label="Ngày hẹn"
                type="date"
                error={formState.errors.requested_date?.message}
                {...register("requested_date")}
              />
            </>
          ) : (
            // canEdit is false only when `order` exists (see its definition above) and the actor's
            // scope doesn't cover it — never for a not-yet-created draft.
            <div className="space-y-4">
              <ReadOnlyField label="Khách hàng" value={order.customer_name ?? "Khách lẻ"} />
              <ReadOnlyField label="Phòng phụ trách" value={order.division_name ?? ""} />
              <ReadOnlyField label="Địa chỉ thi công" value={order.service_address} />
              <ReadOnlyField label="Mô tả công việc" value={order.work_description} />
              <ReadOnlyField
                label="Độ ưu tiên"
                value={PRIORITY_LABELS[order.priority as Priority]}
              />
              <ReadOnlyField label="Ngày hẹn" value={order.requested_date ?? ""} />
              <ReadOnlyField label="Tổng cộng" value={formatCurrency(order.total)} />
            </div>
          )}
        </div>
      </form>

      {/* AC-ORD-038: ở desktop, "dòng hàng" không đủ chỗ trong nửa cột phải cạnh Section 1 (6-7
          trường mỗi dòng) — dùng phương án thay thế của spec: bảng dòng hàng full-width bên dưới.
          Đứng trước trong DOM để mobile vẫn đọc Dòng hàng → Tổng tiền theo đúng thứ tự; desktop tự
          đặt lại vị trí bằng lg:col-start/row-start bên dưới, không phụ thuộc thứ tự DOM. */}
      <div className="lg:col-span-2 lg:row-start-2">
        <OrderLinesSection
          order={order}
          canEdit={canEdit}
          runWrite={runWrite}
          onAddLine={() => {
            setAddLineOpen(true);
          }}
        />
      </div>

      {order ? (
        <div className="lg:col-start-2 lg:row-start-1">
          <OrderTotalsSection order={order} />
        </div>
      ) : null}

      {canEdit ? (
        <div
          data-testid="draft-order-save-bar"
          // bottom-16, not bottom-0: BottomNav is `fixed bottom-0` too, so bottom-0 here would stack
          // this bar directly on top of it, hiding the nav for the entire scroll range. `pb-24` on
          // the page's Content already reserves this space (UI_GUIDELINES §4) for exactly this.
          // flex-col: AC-ORD-166 cần helper text nằm trong chính khối sticky này (không phải phía
          // dưới DOM của nó) để không bị đẩy ra ngoài vùng nhìn thấy trên mobile.
          className="sticky bottom-16 z-10 flex flex-col gap-2 bg-page py-3 lg:static lg:col-span-2 lg:row-start-3 lg:bottom-auto lg:bg-transparent lg:py-0"
        >
          {missingInfoHint ? <p className="text-xs text-muted">{missingInfoHint}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              form="draft-order-form"
              loading={createOrder.isPending || updateOrder.isPending}
              disabled={!canSave}
              aria-disabled={!canSave}
            >
              Lưu nháp
            </Button>
            {order?.allowed_commands.includes("submit") ? (
              <Button
                type="button"
                variant="secondary"
                disabled={!canSave}
                aria-disabled={!canSave}
                onClick={() => {
                  setSubmitOpen(true);
                }}
              >
                Gửi đơn
              </Button>
            ) : null}
            {order?.allowed_commands.includes("cancel") ? (
              <Button
                type="button"
                variant="secondary"
                disabled={!canCancel}
                aria-disabled={!canCancel}
                onClick={() => {
                  setCancelOpen(true);
                }}
              >
                Huỷ đơn
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {addLineOpen ? (
        <AddLineSheet
          onClose={() => {
            setAddLineOpen(false);
          }}
          runOrderWrite={runWriteOrCreate}
        />
      ) : null}
      <ConfirmDialog
        open={reloadConfirmOpen}
        onClose={() => {
          setReloadConfirmOpen(false);
        }}
        title="Tải lại đơn?"
        message="Bạn có thay đổi chưa lưu. Tải lại sẽ mất các thay đổi này, tiếp tục?"
        confirmLabel="Tải lại"
        onConfirm={() => void doReload()}
      />
      {order ? (
        <ConfirmDialog
          open={submitOpen}
          onClose={() => {
            setSubmitOpen(false);
          }}
          title="Gửi đơn?"
          message={`Gửi đơn ${order.code} tới Quản lý kỹ thuật?`}
          confirmLabel="Gửi đơn"
          loading={submitOrder.isPending}
          onConfirm={doSubmit}
        />
      ) : null}
      {order ? (
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
            void orderQuery.refetch();
          }}
          onConfirm={doCancel}
        />
      ) : null}
    </div>
  );
}
