import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { formatDateTime } from "../../../lib/format";
import { ApiError, formError } from "../../auth/errors";
import {
  SERVICES_KEY,
  useActivateService,
  useCreateService,
  useDeactivateService,
  useServicePriceHistory,
  useUpdateService,
  type Service,
  type ServiceCreateBody,
} from "../api";
import { fieldErrors } from "../errors";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  serviceCreateSchema,
  serviceEditSchema,
  UNIT_LABELS,
  UNIT_ORDER,
  type Category,
  type ServiceFormValues,
  type Unit,
} from "../schemas";
import { formatServicePrice, StatusBadge } from "./ServiceList";

type ConfirmKind = "deactivate" | "activate" | null;
// Every field that renders its own error — formError() suppresses the Alert when every reported
// error is already shown under one of these (e.g. code CONFLICT: same text as `detail` and the
// field error — see catalog/service.py _code_taken()).
const SHOWN_FIELDS = [
  "code",
  "name",
  "category",
  "unit",
  "price",
  "cost_price",
  "vat_rate",
  "default_estimated_hours",
  "description",
];

const FORM_ID = "service-form";

/** Create or edit a service (AC-CAT-028/029); read-only detail view for Sale (AC-CAT-031); ngừng/mở
 * kinh doanh (AC-CAT-030) live in the same sheet. No image (unlike products, M2-01b). */
export function ServiceFormSheet({
  onClose,
  service: initialService,
  canManage,
}: {
  onClose: () => void;
  service?: Service;
  canManage: boolean;
}) {
  // The working copy: updated after every successful command, so a second action in the same open
  // sheet uses the fresh `version` (same rationale as ProductFormSheet).
  const [service, setService] = useState<Service | undefined>(initialService);
  const readOnly = service !== undefined && !canManage;
  const toast = useToast();
  const queryClient = useQueryClient();
  const create = useCreateService();
  const update = useUpdateService();
  const deactivate = useDeactivateService();
  const activate = useActivateService();

  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [showReload, setShowReload] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmKind>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const history = useServicePriceHistory(service?.id ?? "", showHistory && service !== undefined);

  const { register, handleSubmit, formState, control } = useForm<ServiceFormValues>({
    resolver: zodResolver(
      service ? serviceEditSchema : serviceCreateSchema,
    ) as Resolver<ServiceFormValues>,
    defaultValues: {
      code: service?.code ?? "",
      category: (service?.category as Category | undefined) ?? CATEGORY_ORDER[0],
      unit: (service?.unit as Unit | undefined) ?? UNIT_ORDER[0],
      name: service?.name ?? "",
      price: service?.price ?? 0,
      cost_price: service?.cost_price != null ? String(service.cost_price) : "",
      vat_rate: service ? Number(service.vat_rate) : 8,
      price_fixed: service?.price_fixed ?? false,
      default_estimated_hours: service?.default_estimated_hours ?? "",
      description: service?.description ?? "",
    },
  });
  // Same disable/helper-text pattern as ProductFormSheet (AC-CAT-079, applied here for parity) —
  // edit mode only, see the comment there.
  const costPriceValue = useWatch({ control, name: "cost_price" });
  const costPriceMissing = service !== undefined && costPriceValue.trim() === "";

  const title = service ? (readOnly ? "Chi tiết dịch vụ" : "Sửa dịch vụ") : "Thêm dịch vụ";
  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [SERVICES_KEY] });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerErrors({});
    setFormMessage(null);
    setShowReload(false);
    try {
      if (!service) {
        const body: ServiceCreateBody = {
          code: values.code,
          category: values.category,
          unit: values.unit,
          name: values.name,
          price: values.price,
          cost_price: Number(values.cost_price),
          vat_rate: values.vat_rate,
          price_fixed: values.price_fixed,
          default_estimated_hours: values.default_estimated_hours
            ? Number(values.default_estimated_hours)
            : null,
          description: values.description || null,
        };
        const created = await create.mutateAsync(body);
        toast(`Đã thêm dịch vụ ${created.name}.`);
        onClose();
        return;
      }
      const updated = await update.mutateAsync({
        id: service.id,
        body: {
          version: service.version,
          name: values.name,
          price: values.price,
          cost_price: Number(values.cost_price),
          vat_rate: values.vat_rate,
          price_fixed: values.price_fixed,
          default_estimated_hours: values.default_estimated_hours
            ? Number(values.default_estimated_hours)
            : null,
          description: values.description || null,
        },
      });
      setService(updated);
      toast("Đã cập nhật.");
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.problem.code === "STALE_VERSION") setShowReload(true);
        setFormMessage(formError(error, SHOWN_FIELDS));
        setServerErrors(fieldErrors(error));
      } else {
        setFormMessage("Không thực hiện được. Vui lòng thử lại.");
      }
    }
  });

  const runConfirm = async () => {
    if (!service) return;
    setConfirmError(null);
    try {
      if (confirming === "deactivate") {
        setService(await deactivate.mutateAsync({ id: service.id, version: service.version }));
      } else if (confirming === "activate") {
        setService(await activate.mutateAsync({ id: service.id, version: service.version }));
      }
      setConfirming(null);
    } catch (error) {
      setConfirmError(
        error instanceof ApiError
          ? (error.problem.detail ?? "Không thực hiện được.")
          : "Không thực hiện được.",
      );
    }
  };
  const confirmRunning = deactivate.isPending || activate.isPending;

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={title}
        dismissible={!(create.isPending || update.isPending) && confirming === null}
        footer={
          readOnly ? undefined : showReload ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                invalidateList();
                onClose();
              }}
            >
              Tải lại
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              {costPriceMissing ? <p className="text-xs text-muted">Cần nhập giá vốn.</p> : null}
              <Button
                type="submit"
                form={FORM_ID}
                loading={create.isPending || update.isPending}
                disabled={costPriceMissing}
                aria-disabled={costPriceMissing}
              >
                Lưu
              </Button>
            </div>
          )
        }
      >
        {readOnly ? (
          <div className="space-y-4">
            <dl className="divide-y divide-line">
              {(
                [
                  ["Mã dịch vụ", service.code],
                  ["Danh mục", CATEGORY_LABELS[service.category as Category]],
                  ["Đơn vị tính", UNIT_LABELS[service.unit as Unit]],
                  ["Đơn giá", formatServicePrice(service.price)],
                  [
                    "Giá vốn",
                    service.cost_price != null ? formatServicePrice(service.cost_price) : "—",
                  ],
                  ["VAT", `${service.vat_rate}%`],
                  [
                    "Số giờ ước tính",
                    service.default_estimated_hours != null
                      ? `${service.default_estimated_hours} giờ`
                      : "—",
                  ],
                  ["Mô tả", service.description ?? "—"],
                ] as [string, ReactNode][]
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2 text-sm">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-medium text-heading">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 py-2 text-sm">
                <dt className="text-muted">Trạng thái</dt>
                <dd>
                  <StatusBadge service={service} />
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <form
            id={FORM_ID}
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            className="space-y-4"
          >
            {formMessage ? <Alert>{formMessage}</Alert> : null}
            {!service ? (
              <TextField
                label="Mã dịch vụ"
                error={formState.errors.code?.message ?? serverErrors.code}
                {...register("code")}
              />
            ) : null}
            <TextField
              label="Tên dịch vụ"
              error={formState.errors.name?.message ?? serverErrors.name}
              {...register("name")}
            />
            {service ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Trạng thái:</span>
                <StatusBadge service={service} />
              </div>
            ) : null}
            {!service ? (
              <Select
                label="Nhóm dịch vụ"
                error={formState.errors.category?.message ?? serverErrors.category}
                {...register("category")}
              >
                {CATEGORY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </Select>
            ) : null}
            {!service ? (
              <Select
                label="Đơn vị tính"
                error={formState.errors.unit?.message ?? serverErrors.unit}
                {...register("unit")}
              >
                {UNIT_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {UNIT_LABELS[value]}
                  </option>
                ))}
              </Select>
            ) : null}
            <TextField
              label="Đơn giá (chưa VAT)"
              inputMode="numeric"
              error={formState.errors.price?.message ?? serverErrors.price}
              {...register("price")}
            />
            <TextField
              label="Giá vốn (chưa VAT)"
              inputMode="numeric"
              error={formState.errors.cost_price?.message ?? serverErrors.cost_price}
              {...register("cost_price")}
            />
            <TextField
              label="VAT (%)"
              inputMode="decimal"
              error={formState.errors.vat_rate?.message ?? serverErrors.vat_rate}
              {...register("vat_rate")}
            />
            <label className="flex min-h-11 items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                className="size-5 rounded border-line text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                {...register("price_fixed")}
              />
              Giá cố định
            </label>
            <TextField
              label="Số giờ ước tính (gợi ý)"
              inputMode="decimal"
              error={
                formState.errors.default_estimated_hours?.message ??
                serverErrors.default_estimated_hours
              }
              {...register("default_estimated_hours")}
            />
            <Textarea label="Mô tả" error={serverErrors.description} {...register("description")} />

            {service && canManage ? (
              <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                {service.is_active ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setConfirming("deactivate");
                    }}
                  >
                    Ngừng kinh doanh
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setConfirming("activate");
                    }}
                  >
                    Mở lại kinh doanh
                  </Button>
                )}
              </div>
            ) : null}

            {service && canManage ? (
              <div className="space-y-3 border-t border-line pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowHistory((open) => !open);
                  }}
                >
                  Lịch sử giá
                </Button>
                {showHistory ? (
                  history.isLoading ? (
                    <p className="text-sm text-muted">Đang tải…</p>
                  ) : history.data && history.data.length > 0 ? (
                    <ul className="space-y-3">
                      {history.data.map((row, index) => (
                        <li key={index} className="space-y-1 rounded-xl bg-sidebar-sub p-3 text-sm">
                          <div className="flex justify-between gap-2 text-muted">
                            <span>{row.changed_by?.full_name ?? "—"}</span>
                            <span>{formatDateTime(row.changed_at)}</span>
                          </div>
                          <p className="text-body">
                            Giá bán: {formatServicePrice(row.old_price)} →{" "}
                            {formatServicePrice(row.new_price)}
                          </p>
                          <p className="text-body">
                            Giá vốn:{" "}
                            {row.old_cost_price != null
                              ? formatServicePrice(row.old_cost_price)
                              : "—"}{" "}
                            →{" "}
                            {row.new_cost_price != null
                              ? formatServicePrice(row.new_cost_price)
                              : "—"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Chưa có lần sửa giá nào.</p>
                  )
                ) : null}
              </div>
            ) : null}
          </form>
        )}
      </Sheet>
      {confirming ? (
        <ConfirmDialog
          open
          onClose={() => {
            setConfirming(null);
            setConfirmError(null);
          }}
          title={confirming === "deactivate" ? "Ngừng kinh doanh" : "Mở lại kinh doanh"}
          message={
            confirming === "deactivate"
              ? "Dịch vụ sẽ không hiện khi tạo đơn mới."
              : "Dịch vụ sẽ hiện lại khi tạo đơn mới."
          }
          confirmLabel={confirming === "deactivate" ? "Ngừng kinh doanh" : "Mở lại kinh doanh"}
          onConfirm={() => void runConfirm()}
          loading={confirmRunning}
          error={confirmError}
        />
      ) : null}
    </>
  );
}
