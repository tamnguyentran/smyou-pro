import { zodResolver } from "@hookform/resolvers/zod";
import { ImageOff, Save, Upload, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { NumberField } from "../../../components/ui/NumberField";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { formatDateTime } from "../../../lib/format";
import { ApiError, formError } from "../../auth/errors";
import { EmployeeSearchField } from "../../employees/components/EmployeeSearchField";
import { compressImage, validateImageFile } from "../../products/imageCompression";
import { CustomerSearchField } from "../../revenueReport/components/CustomerSearchField";
import {
  attachmentUrl,
  useCreateGift,
  useGiftPhotos,
  useUpdateGift,
  type CustomerGift,
} from "../api";
import { fieldErrors } from "../errors";
import { giftSchema, type GiftFormValues } from "../schemas";
import { uploadGiftPhoto } from "../uploadGiftPhoto";

const FORM_ID = "gift-form";
const SHOWN_FIELDS = [
  "occasion_name",
  "performed_date",
  "gift_name",
  "quantity",
  "unit_price",
  "other_cost",
  "performed_by",
  "requested_by",
  "note",
];

function PhotosSection({ giftId }: { giftId: string }) {
  const toast = useToast();
  const photos = useGiftPhotos(giftId);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem.message);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setProgress(0);
    try {
      const blob = await compressImage(file);
      await uploadGiftPhoto(giftId, blob, setProgress);
      await photos.refetch();
      toast("Đã tải ảnh quà tặng.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? "Không thực hiện được. Vui lòng thử lại.")
          : "Không thực hiện được. Vui lòng thử lại.",
      );
    } finally {
      setProgress(null);
      setPreview(null);
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <div className="space-y-4 border-t border-dashed border-line pt-4">
      <div className="space-y-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading hover:bg-sidebar-sub has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2">
          <Upload aria-hidden="true" className="size-4" />
          Tải ảnh quà tặng
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={progress !== null}
            onChange={(event) => void onChange(event)}
          />
        </label>
        {preview ? (
          <img src={preview} alt="Xem trước" className="size-20 rounded-xl object-cover" />
        ) : null}
        {progress !== null ? (
          <div className="w-32">
            <div
              role="progressbar"
              aria-label="Đang tải ảnh"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${String(progress)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">Đang tải ảnh… {progress}%</p>
          </div>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
      </div>

      {photos.isPending ? (
        <div
          role="group"
          aria-busy="true"
          aria-label="Đang tải danh sách ảnh"
          className="h-20 animate-pulse rounded-2xl bg-sidebar-sub"
        />
      ) : photos.data && photos.data.items.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {photos.data.items.map((p) => (
            <a
              key={p.id}
              href={attachmentUrl(p.id)}
              target="_blank"
              rel="noreferrer"
              className="block space-y-1 rounded-2xl bg-card p-2 shadow-card"
            >
              <img
                src={attachmentUrl(p.id)}
                alt={`Ảnh tải lên ${formatDateTime(p.created_at)}`}
                className="aspect-square w-full rounded-xl object-cover"
              />
            </a>
          ))}
        </div>
      ) : (
        <EmptyState icon={ImageOff} message="Chưa có ảnh." />
      )}
    </div>
  );
}

/** Tạo/sửa 1 bản ghi tặng quà (M16-01b AC-GFT-022..025). Sheet sửa: khách hàng cố định, không
 * sửa được. Sheet thêm mới: có ô chọn khách hàng riêng (search-select), bắt buộc chọn trước khi
 * lưu — điền sẵn khách đang chọn ở trang `/customer-gifts` nếu có, nhưng vẫn sửa được. */
export function GiftFormSheet({
  onClose,
  customerId: pageCustomerId,
  customerName: pageCustomerName = "",
  gift: initialGift,
  onCustomerSaved,
}: {
  onClose: () => void;
  customerId: string;
  customerName?: string;
  gift?: CustomerGift;
  /** Gọi sau khi tạo mới thành công, để trang chuyển ô tìm kiếm sang khách hàng vừa chọn. */
  onCustomerSaved?: (customer: { id: string; name: string }) => void;
}) {
  const [gift, setGift] = useState<CustomerGift | undefined>(initialGift);
  const [customerId, setCustomerId] = useState(pageCustomerId);
  const [customerName, setCustomerName] = useState(pageCustomerName);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [performedById, setPerformedById] = useState(gift?.performed_by.id ?? "");
  const [performedByName, setPerformedByName] = useState(gift?.performed_by.full_name ?? "");
  const [requestedById, setRequestedById] = useState(gift?.requested_by.id ?? "");
  const [requestedByName, setRequestedByName] = useState(gift?.requested_by.full_name ?? "");
  const [quantityRaw, setQuantityRaw] = useState(String(gift?.quantity ?? 1));
  const [unitPriceRaw, setUnitPriceRaw] = useState(String(gift?.unit_price ?? 0));
  const [otherCostRaw, setOtherCostRaw] = useState(String(gift?.other_cost ?? 0));
  const toast = useToast();
  const create = useCreateGift(customerId);
  const update = useUpdateGift(customerId);

  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [showReload, setShowReload] = useState(false);

  const { register, handleSubmit, formState, setValue } = useForm<GiftFormValues>({
    resolver: zodResolver(giftSchema) as Resolver<GiftFormValues>,
    defaultValues: {
      occasion_name: gift?.occasion_name ?? "",
      performed_date: gift?.performed_date ?? "",
      gift_name: gift?.gift_name ?? "",
      quantity: gift?.quantity ?? 1,
      unit_price: gift?.unit_price ?? 0,
      other_cost: gift?.other_cost ?? 0,
      performed_by: gift?.performed_by.id ?? "",
      requested_by: gift?.requested_by.id ?? "",
      note: gift?.note ?? "",
    },
  });

  const title = gift ? "Sửa quà tặng" : "Thêm quà tặng";

  const onSubmit = handleSubmit(async (values) => {
    setServerErrors({});
    setFormMessage(null);
    setShowReload(false);
    if (!gift && !customerId) {
      setCustomerError("Vui lòng chọn khách hàng.");
      return;
    }
    setCustomerError(null);
    const shared = {
      occasion_name: values.occasion_name,
      performed_date: values.performed_date,
      gift_name: values.gift_name,
      quantity: values.quantity,
      unit_price: values.unit_price,
      other_cost: values.other_cost,
      performed_by: values.performed_by,
      requested_by: values.requested_by,
      note: values.note === "" ? null : values.note,
    };
    try {
      if (!gift) {
        const created = await create.mutateAsync({ customer_id: customerId, ...shared });
        setGift(created);
        toast("Đã thêm quà tặng.");
        onCustomerSaved?.({ id: customerId, name: customerName });
        return;
      }
      const updated = await update.mutateAsync({
        id: gift.id,
        body: { version: gift.version, ...shared },
      });
      setGift(updated);
      toast("Đã cập nhật.");
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

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      wide
      dismissible={!(create.isPending || update.isPending)}
      footer={
        showReload ? (
          <Button type="button" variant="secondary" onClick={onClose}>
            Tải lại
          </Button>
        ) : (
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              icon={<X aria-hidden="true" className="size-4" />}
              disabled={create.isPending || update.isPending}
              onClick={onClose}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              className="flex-1"
              icon={<Save aria-hidden="true" className="size-4" />}
              loading={create.isPending || update.isPending}
            >
              Lưu
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <form
          id={FORM_ID}
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="space-y-4"
        >
          {formMessage ? <Alert>{formMessage}</Alert> : null}
          {!gift ? (
            <div>
              <CustomerSearchField
                customerId={customerId}
                customerName={customerName}
                onSelect={(customer) => {
                  setCustomerId(customer.id);
                  setCustomerName(customer.name);
                  setCustomerError(null);
                }}
                placeholder="Tìm khách hàng…"
              />
              {customerError ? (
                <p className="mt-1.5 text-xs font-medium text-urgent-fg">{customerError}</p>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Dịp/lễ"
              error={formState.errors.occasion_name?.message ?? serverErrors.occasion_name}
              {...register("occasion_name")}
            />
            <TextField
              label="Ngày thực hiện"
              type="date"
              error={formState.errors.performed_date?.message ?? serverErrors.performed_date}
              {...register("performed_date")}
            />
            <TextField
              label="Tên gói quà"
              error={formState.errors.gift_name?.message ?? serverErrors.gift_name}
              {...register("gift_name")}
            />
            <NumberField
              label="Số lượng"
              value={quantityRaw}
              error={formState.errors.quantity?.message ?? serverErrors.quantity}
              onChange={(raw) => {
                setQuantityRaw(raw);
                setValue("quantity", raw === "" ? NaN : Number(raw), { shouldValidate: false });
              }}
            />
            <NumberField
              label="Đơn giá"
              value={unitPriceRaw}
              error={formState.errors.unit_price?.message ?? serverErrors.unit_price}
              onChange={(raw) => {
                setUnitPriceRaw(raw);
                setValue("unit_price", raw === "" ? NaN : Number(raw), { shouldValidate: false });
              }}
            />
            <NumberField
              label="Chi phí khác"
              value={otherCostRaw}
              error={formState.errors.other_cost?.message ?? serverErrors.other_cost}
              onChange={(raw) => {
                setOtherCostRaw(raw);
                setValue("other_cost", raw === "" ? NaN : Number(raw), { shouldValidate: false });
              }}
            />
            <EmployeeSearchField
              label="Người thực hiện"
              employeeId={performedById}
              employeeName={performedByName}
              error={formState.errors.performed_by?.message ?? serverErrors.performed_by}
              onSelect={(employee) => {
                setValue("performed_by", employee.id, { shouldValidate: true });
                setPerformedById(employee.id);
                setPerformedByName(employee.name);
              }}
            />
            <EmployeeSearchField
              label="Người yêu cầu"
              employeeId={requestedById}
              employeeName={requestedByName}
              error={formState.errors.requested_by?.message ?? serverErrors.requested_by}
              onSelect={(employee) => {
                setValue("requested_by", employee.id, { shouldValidate: true });
                setRequestedById(employee.id);
                setRequestedByName(employee.name);
              }}
            />
          </div>
          <Textarea
            label="Ghi chú"
            error={formState.errors.note?.message ?? serverErrors.note}
            {...register("note")}
          />
        </form>

        {gift ? <PhotosSection giftId={gift.id} /> : null}
      </div>
    </Sheet>
  );
}
