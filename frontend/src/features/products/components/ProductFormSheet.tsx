import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { formatCurrency } from "../../../lib/format";
import { ApiError, formError } from "../../auth/errors";
import {
  PRODUCTS_KEY,
  productImageUrl,
  useActivateProduct,
  useCreateProduct,
  useDeactivateProduct,
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
  "vat_rate",
  "warranty_months",
  "specs",
];

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

  const { register, handleSubmit, formState } = useForm<ProductFormValues>({
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
      vat_rate: product ? Number(product.vat_rate) : 8,
      price_fixed: product?.price_fixed ?? false,
      warranty_months: product?.warranty_months != null ? String(product.warranty_months) : "",
      specs: product?.specs ?? "",
    },
  });

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
          vat_rate: values.vat_rate,
          price_fixed: values.price_fixed,
          warranty_months: values.warranty_months ? Number(values.warranty_months) : null,
          specs: values.specs || null,
        };
        const created = await create.mutateAsync(body);
        toast(`Đã thêm sản phẩm ${created.name}.`);
        // §8 giả định: cùng Sheet chuyển sang chế độ sửa cho sản phẩm vừa tạo — không mở URL riêng.
        setProduct(created);
        return;
      }
      const updated = await update.mutateAsync({
        id: product.id,
        body: {
          version: product.version,
          name: values.name,
          brand: values.brand || null,
          price: values.price,
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
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
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

            {showReload ? (
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
              <Button type="submit" loading={create.isPending || update.isPending}>
                Lưu
              </Button>
            )}

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
