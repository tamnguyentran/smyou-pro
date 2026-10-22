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
import { formatCurrency, formatDateTime } from "../../../lib/format";
import { ApiError, formError } from "../../auth/errors";
import {
  PRODUCTS_KEY,
  productImageUrl,
  useActivateProduct,
  useCreateProduct,
  useDeactivateProduct,
  useProductPriceHistory,
  useUpdateProduct,
  type Product,
  type ProductCreateBody,
} from "../api";
import { fieldErrors } from "../errors";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  productCreateSchema,
  productEditSchema,
  UNIT_LABELS,
  UNIT_ORDER,
  type Category,
  type ProductFormValues,
  type Unit,
} from "../schemas";
import { ImageUploadField } from "./ImageUploadField";
import { ProductImage, StatusBadge } from "./ProductList";

type ConfirmKind = "deactivate" | "activate" | null;
// Every field that renders its own error — formError() suppresses the Alert when every reported
// error is already shown under one of these (e.g. sku CONFLICT: same text as `detail` and the
// field error — see catalog/service.py _sku_taken()).
const SHOWN_FIELDS = [
  "sku",
  "name",
  "category",
  "unit",
  "brand",
  "price",
  "cost_price",
  "vat_rate",
  "warranty_months",
  "specs",
];

const FORM_ID = "product-form";

/** Create or edit a product (AC-CAT-013/014); read-only detail view for Sale (AC-CAT-017); ngừng/mở
 * kinh doanh (AC-CAT-015) live in the same sheet. Image upload (AC-CAT-016) is wired in separately. */
export function ProductFormSheet({
  onClose,
  product: initialProduct,
  canManage,
}: {
  onClose: () => void;
  product?: Product;
  canManage: boolean;
}) {
  // The working copy: updated after every successful command, so a second action in the same open
  // sheet uses the fresh `version` (same rationale as EmployeeFormSheet, M1-04b review round 1).
  const [product, setProduct] = useState<Product | undefined>(initialProduct);
  const readOnly = product !== undefined && !canManage;
  const toast = useToast();
  const queryClient = useQueryClient();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const deactivate = useDeactivateProduct();
  const activate = useActivateProduct();

  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [showReload, setShowReload] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmKind>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = useProductPriceHistory(product?.id ?? "", showHistory && product !== undefined);

  const { register, handleSubmit, formState, control } = useForm<ProductFormValues>({
    resolver: zodResolver(
      product ? productEditSchema : productCreateSchema,
    ) as Resolver<ProductFormValues>,
    defaultValues: {
      sku: product?.sku ?? "",
      category: (product?.category as Category | undefined) ?? CATEGORY_ORDER[0],
      unit: (product?.unit as Unit | undefined) ?? UNIT_ORDER[0],
      name: product?.name ?? "",
      brand: product?.brand ?? "",
      price: product?.price ?? 0,
      cost_price: product?.cost_price != null ? String(product.cost_price) : "",
      vat_rate: product ? Number(product.vat_rate) : 8,
      price_fixed: product?.price_fixed ?? false,
      warranty_months: product?.warranty_months != null ? String(product.warranty_months) : "",
      specs: product?.specs ?? "",
    },
  });
  // AC-CAT-079: disable "Lưu" pre-emptively (not just after submit) while editing a legacy item
  // whose giá vốn is still empty — scoped to edit mode only, like the AC's own wording ("Form sửa
  // sản phẩm"); on create, cost_price behaves like every other required field (inline error on
  // submit, same as sku/name) rather than pre-blocking the button.
  // useWatch (not useForm's `watch()`) — the latter returns a function the React Compiler can't
  // memoize safely (DraftOrderForm hit the same lint warning, resolved the same way).
  const costPriceValue = useWatch({ control, name: "cost_price" });
  const costPriceMissing = product !== undefined && costPriceValue.trim() === "";

  const title = product ? (readOnly ? "Chi tiết sản phẩm" : "Sửa sản phẩm") : "Thêm sản phẩm";
  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerErrors({});
    setFormMessage(null);
    setShowReload(false);
    try {
      if (!product) {
        const body: ProductCreateBody = {
          sku: values.sku,
          category: values.category,
          unit: values.unit,
          name: values.name,
          brand: values.brand || null,
          price: values.price,
          cost_price: Number(values.cost_price),
          vat_rate: values.vat_rate,
          price_fixed: values.price_fixed,
          warranty_months: values.warranty_months ? Number(values.warranty_months) : null,
          specs: values.specs || null,
        };
        const created = await create.mutateAsync(body);
        toast(`Đã thêm sản phẩm ${created.name}.`);
        onClose();
        return;
      }
      const updated = await update.mutateAsync({
        id: product.id,
        body: {
          version: product.version,
          name: values.name,
          brand: values.brand || null,
          price: values.price,
          cost_price: Number(values.cost_price),
          vat_rate: values.vat_rate,
          price_fixed: values.price_fixed,
          warranty_months: values.warranty_months ? Number(values.warranty_months) : null,
          specs: values.specs || null,
        },
      });
      setProduct(updated);
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
    if (!product) return;
    setConfirmError(null);
    try {
      if (confirming === "deactivate") {
        setProduct(await deactivate.mutateAsync({ id: product.id, version: product.version }));
      } else if (confirming === "activate") {
        setProduct(await activate.mutateAsync({ id: product.id, version: product.version }));
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
        dismissible={
          !(create.isPending || update.isPending || imageUploading) && confirming === null
        }
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
            <ProductImage
              src={
                product.image_attachment_id ? productImageUrl(product.image_attachment_id) : null
              }
              alt="Ảnh sản phẩm"
              size="size-20"
            />
            <dl className="divide-y divide-line">
              {(
                [
                  ["Mã hàng", product.sku],
                  ["Danh mục", CATEGORY_LABELS[product.category as Category]],
                  ["Hãng", product.brand ?? "—"],
                  ["Đơn vị tính", UNIT_LABELS[product.unit as Unit]],
                  ["Đơn giá", formatCurrency(product.price)],
                  [
                    "Giá vốn",
                    product.cost_price != null ? formatCurrency(product.cost_price) : "—",
                  ],
                  ["VAT", `${product.vat_rate}%`],
                  [
                    "Bảo hành",
                    product.warranty_months != null
                      ? `${String(product.warranty_months)} tháng`
                      : "—",
                  ],
                  ["Cấu hình", product.specs ?? "—"],
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
                  <StatusBadge product={product} />
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
            {!product ? (
              <TextField
                label="Mã hàng"
                error={formState.errors.sku?.message ?? serverErrors.sku}
                {...register("sku")}
              />
            ) : null}
            <TextField
              label="Tên sản phẩm"
              error={formState.errors.name?.message ?? serverErrors.name}
              {...register("name")}
            />
            {product ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Trạng thái:</span>
                <StatusBadge product={product} />
              </div>
            ) : null}
            {product ? (
              <ImageUploadField
                product={product}
                onUploaded={(imageAttachmentId) => {
                  setProduct({ ...product, image_attachment_id: imageAttachmentId });
                  invalidateList();
                }}
                onBusyChange={setImageUploading}
              />
            ) : null}
            {!product ? (
              <Select
                label="Danh mục"
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
            <TextField label="Hãng" error={serverErrors.brand} {...register("brand")} />
            {!product ? (
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
              label="Đơn giá"
              inputMode="numeric"
              error={formState.errors.price?.message ?? serverErrors.price}
              {...register("price")}
            />
            <TextField
              label="Giá vốn"
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
              label="Bảo hành (tháng)"
              inputMode="numeric"
              error={formState.errors.warranty_months?.message ?? serverErrors.warranty_months}
              {...register("warranty_months")}
            />
            <Textarea label="Cấu hình" error={serverErrors.specs} {...register("specs")} />

            {product && canManage ? (
              <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                {product.is_active ? (
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

            {product && canManage ? (
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
                            Giá bán: {formatCurrency(row.old_price)} →{" "}
                            {formatCurrency(row.new_price)}
                          </p>
                          <p className="text-body">
                            Giá vốn:{" "}
                            {row.old_cost_price != null ? formatCurrency(row.old_cost_price) : "—"}{" "}
                            →{" "}
                            {row.new_cost_price != null ? formatCurrency(row.new_cost_price) : "—"}
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
              ? "Sản phẩm sẽ không hiện khi tạo đơn mới."
              : "Sản phẩm sẽ hiện lại khi tạo đơn mới."
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
