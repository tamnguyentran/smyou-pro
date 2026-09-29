import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { ChipGroup } from "../../../components/ui/Chip";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Select } from "../../../components/ui/Select";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { formatCurrency } from "../../../lib/format";
import { ApiError } from "../../auth/errors";
import { useMe } from "../../me/api";
import { useCreateOrder, useOrder, useUpdateOrder, type Order, type OrderCreateBody } from "../api";
import {
  DIVISION_LABELS,
  DIVISION_ORDER,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  orderInfoSchema,
  type Division,
  type OrderInfoFormValues,
  type Priority,
} from "../schemas";
import { AddLineSheet } from "./AddLineSheet";
import { CustomerPicker } from "./CustomerPicker";
import { OrderLinesSection } from "./OrderLinesSection";
import { OrderTotalsSection } from "./OrderTotalsSection";
import { useOrderWriteQueue } from "./writeQueue";

const BLANK_VALUES: OrderInfoFormValues = {
  customerMode: "search",
  customer_id: "",
  customer_name: "",
  customer_phone: "",
  division: "",
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
    division: (order.division as Division | null) ?? "",
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
    division: values.division || null,
    service_address: values.service_address || null,
    work_description: values.work_description || null,
    priority: values.priority,
    requested_date: values.requested_date || null,
  };
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="text-body">{value || "—"}</p>
    </div>
  );
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
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  // Serializes this save against every line edit (see writeQueue.ts) — a "Giảm giá" blur and "Lưu
  // nháp" both PATCH with the order's current `version`, and firing both at once would make
  // whichever lands second fail with a spurious STALE_VERSION, since it wasn't really a different actor.
  const { enqueue, currentOrder, runWrite } = useOrderWriteQueue(() => idRef.current);

  const [staleVersion, setStaleVersion] = useState(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addLineOpen, setAddLineOpen] = useState(false);

  const { register, handleSubmit, watch, setValue, getValues, reset, formState, control } =
    useForm<OrderInfoFormValues>({
      resolver: zodResolver(orderInfoSchema) as Resolver<OrderInfoFormValues>,
      defaultValues: BLANK_VALUES,
    });
  const priority = useWatch({ control, name: "priority" });

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

  if (id && orderQuery.isPending) return <Waiting />;
  if (id && orderQuery.isError) {
    return <p className="text-sm text-body">Không tải được đơn hàng.</p>;
  }

  if (order && order.status !== "DRAFT") {
    return (
      <section className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm leading-relaxed text-body">
          Đơn {order.code} đã được gửi, không thể sửa ở đây.
        </p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Về Tổng quan
        </Link>
      </section>
    );
  }

  const scopes = me.data?.capabilities["order.edit_draft"] ?? [];
  const canEdit =
    !order ||
    scopes.includes("all") ||
    (scopes.includes("own") && order.created_by === me.data?.employee.id);
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
              error={formState.errors.division?.message}
              {...register("division")}
            >
              <option value="">—</option>
              {DIVISION_ORDER.map((division) => (
                <option key={division} value={division}>
                  {DIVISION_LABELS[division]}
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
            <ReadOnlyField
              label="Phòng phụ trách"
              value={order.division ? DIVISION_LABELS[order.division as Division] : ""}
            />
            <ReadOnlyField label="Địa chỉ thi công" value={order.service_address} />
            <ReadOnlyField label="Mô tả công việc" value={order.work_description} />
            <ReadOnlyField label="Độ ưu tiên" value={PRIORITY_LABELS[order.priority as Priority]} />
            <ReadOnlyField label="Ngày hẹn" value={order.requested_date ?? ""} />
            <ReadOnlyField label="Tổng cộng" value={formatCurrency(order.total)} />
          </div>
        )}
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
          className="sticky bottom-16 z-10 bg-page py-3 lg:static lg:col-span-2 lg:row-start-3 lg:bottom-auto lg:bg-transparent lg:py-0"
        >
          <Button
            type="submit"
            form="draft-order-form"
            loading={createOrder.isPending || updateOrder.isPending}
          >
            Lưu nháp
          </Button>
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
    </div>
  );
}
