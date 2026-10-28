import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save, TriangleAlert, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { ApiError, formError } from "../../auth/errors";
import {
  CUSTOMERS_KEY,
  useCreateCustomer,
  useUpdateCustomer,
  type Customer,
  type CustomerCreateBody,
  type CustomerWritten,
} from "../api";
import { fieldErrors } from "../errors";
import {
  customerSchema,
  GENDER_LABELS,
  GENDER_ORDER,
  TYPE_LABELS,
  TYPE_ORDER,
  type CustomerFormValues,
  type CustomerType,
  type Gender,
} from "../schemas";

const SHOWN_FIELDS = [
  "type",
  "name",
  "contact_person",
  "contact_person_phone",
  "phone",
  "email",
  "tax_code",
  "address",
  "note",
  "founded_date",
  "director_name",
  "director_phone",
  "it_contact_name",
  "it_contact_phone",
  "date_of_birth",
  "gender",
  "occupation",
];

function DuplicatePhoneWarning({
  matches,
}: {
  matches: CustomerWritten["duplicate_phone_matches"];
}) {
  if (matches.length === 0) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl border border-review-border bg-review-bg px-3 py-2.5 text-sm text-review-fg"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>SĐT này đã dùng cho: {matches.map((m) => `${m.name} (${m.code})`).join(", ")}.</span>
    </div>
  );
}

const FORM_ID = "customer-form";

/** Groups related fields in a 2-col grid on md+ (CLAUDE.md #11: mobile-first, single column
 * below md). `divider` draws a dashed rule above the group to separate blocks (thông tin chung /
 * người đại diện / giám đốc / phụ trách IT) without a heading label. */
function FieldGroup({ divider = true, children }: { divider?: boolean; children: ReactNode }) {
  return (
    <div className={divider ? "border-t border-dashed border-line pt-4" : undefined}>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

/** Create or edit a customer (AC-CUS-010/011); read-only detail view for TECH_LEAD (AC-CUS-012).
 * No image, no activate/deactivate (unlike Product/Service) — DOMAIN_MODEL §4 has no status field. */
export function CustomerFormSheet({
  onClose,
  customer: initialCustomer,
  canManage,
  onCreated,
}: {
  onClose: () => void;
  customer?: Customer;
  canManage: boolean;
  /** M16-10: màn tạo đơn dùng lại modal này và cần biết khách vừa tạo để chọn sẵn vào đơn —
   * gọi ngay sau khi tạo thành công, kể cả khi modal ở lại vì cảnh báo trùng SĐT. */
  onCreated?: (customer: Customer) => void;
}) {
  // The working copy: updated after every successful command, so a duplicate-phone banner or a
  // second save in the same open sheet uses the fresh `version` (same rationale as ProductFormSheet).
  const [customer, setCustomer] = useState<Customer | undefined>(initialCustomer);
  const readOnly = customer !== undefined && !canManage;
  const toast = useToast();
  const queryClient = useQueryClient();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();

  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [showReload, setShowReload] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<
    CustomerWritten["duplicate_phone_matches"]
  >([]);

  const { register, handleSubmit, formState, control } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema) as Resolver<CustomerFormValues>,
    defaultValues: {
      type: (customer?.type as CustomerType | undefined) ?? TYPE_ORDER[0],
      name: customer?.name ?? "",
      contact_person: customer?.contact_person ?? "",
      contact_person_phone: customer?.contact_person_phone ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      tax_code: customer?.tax_code ?? "",
      address: customer?.address ?? "",
      note: customer?.note ?? "",
      founded_date: customer?.founded_date ?? "",
      director_name: customer?.director_name ?? "",
      director_phone: customer?.director_phone ?? "",
      it_contact_name: customer?.it_contact_name ?? "",
      it_contact_phone: customer?.it_contact_phone ?? "",
      date_of_birth: customer?.date_of_birth ?? "",
      gender: (customer?.gender as CustomerFormValues["gender"] | undefined) ?? undefined,
      occupation: customer?.occupation ?? "",
    },
  });
  // Type bất biến sau khi tạo (§4) — form chỉ hiện đúng bộ field theo type đã chọn lúc tạo.
  const selectedType = useWatch({ control, name: "type" });

  const title = customer
    ? readOnly
      ? "Chi tiết khách hàng"
      : "Sửa khách hàng"
    : "Thêm khách hàng";
  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerErrors({});
    setFormMessage(null);
    setShowReload(false);
    // `type` chỉ gửi lúc tạo — bất biến sau đó, PATCH không nhận trường này (spec §4).
    // Chỉ gửi bộ field khớp `values.type` — RHF không tự xoá value của field đã ẩn khi đổi `type`
    // (không có shouldUnregister), nên field của loại cũ vẫn còn trong `values` nếu người dùng đổi
    // `type` trước khi lưu lúc tạo mới.
    const isCompany = values.type === "COMPANY";
    const shared = {
      name: values.name,
      contact_person: isCompany ? values.contact_person || null : null,
      contact_person_phone: isCompany ? values.contact_person_phone || null : null,
      phone: values.phone,
      email: values.email || null,
      tax_code: values.tax_code || null,
      address: values.address || null,
      note: values.note || null,
      founded_date: isCompany ? values.founded_date || null : null,
      director_name: isCompany ? values.director_name || null : null,
      director_phone: isCompany ? values.director_phone || null : null,
      it_contact_name: isCompany ? values.it_contact_name || null : null,
      it_contact_phone: isCompany ? values.it_contact_phone || null : null,
      date_of_birth: isCompany ? null : values.date_of_birth || null,
      gender: isCompany ? null : values.gender || null,
      occupation: isCompany ? null : values.occupation || null,
    };
    try {
      if (!customer) {
        const body: CustomerCreateBody = { type: values.type, ...shared };
        const created = await create.mutateAsync(body);
        toast(`Đã thêm khách hàng ${created.name}.`);
        onCreated?.(created);
        // Trùng SĐT là cảnh báo không chặn (AC-CUS-010) nhưng cần ở lại để người dùng đọc được —
        // đóng ngay sẽ làm banner biến mất trước khi kịp thấy (giống nhánh sửa ở dưới).
        if (created.duplicate_phone_matches.length === 0) {
          onClose();
          return;
        }
        setCustomer(created);
        setDuplicateMatches(created.duplicate_phone_matches);
        return;
      }
      const updated = await update.mutateAsync({
        id: customer.id,
        body: { version: customer.version, ...shared },
      });
      setCustomer(updated);
      toast("Đã cập nhật.");
      setDuplicateMatches(updated.duplicate_phone_matches);
      // Cảnh báo trùng SĐT là "không chặn" nhưng cần ở lại để người dùng đọc được (§6) — đóng ngay
      // sẽ làm banner biến mất trước khi kịp thấy.
      if (updated.duplicate_phone_matches.length === 0) onClose();
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
      wide={!readOnly}
      dismissible={!(create.isPending || update.isPending)}
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
      {readOnly ? (
        <div className="space-y-4">
          <DuplicatePhoneWarning matches={duplicateMatches} />
          <dl className="divide-y divide-line">
            {(
              [
                ["Mã KH", customer.code],
                ["Loại", TYPE_LABELS[customer.type as CustomerType]],
                ["SĐT", customer.phone],
                ["Email", customer.email ?? "—"],
                ["MST", customer.tax_code ?? "—"],
                ["Địa chỉ", customer.address ?? "—"],
                ["Ghi chú", customer.note ?? "—"],
                ...((customer.type === "COMPANY"
                  ? [
                      ["Người liên hệ", customer.contact_person],
                      ["SĐT người liên hệ", customer.contact_person_phone],
                      ["Ngày thành lập", customer.founded_date],
                      ["Giám đốc", customer.director_name],
                      ["SĐT giám đốc", customer.director_phone],
                      ["Phụ trách IT", customer.it_contact_name],
                      ["SĐT phụ trách IT", customer.it_contact_phone],
                    ]
                  : [
                      ["Ngày sinh", customer.date_of_birth],
                      [
                        "Giới tính",
                        customer.gender ? GENDER_LABELS[customer.gender as Gender] : null,
                      ],
                      ["Nghề nghiệp", customer.occupation],
                    ]
                ).filter(([, value]) => value != null) as [string, ReactNode][]),
              ] as [string, ReactNode][]
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2 text-sm">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium text-heading">{value}</dd>
              </div>
            ))}
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
          <DuplicatePhoneWarning matches={duplicateMatches} />

          <FieldGroup divider={false}>
            <Select
              label="Loại khách hàng"
              error={formState.errors.type?.message ?? serverErrors.type}
              disabled={customer !== undefined}
              {...register("type")}
            >
              {TYPE_ORDER.map((value) => (
                <option key={value} value={value}>
                  {TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
            <TextField
              label="Tên khách hàng"
              error={formState.errors.name?.message ?? serverErrors.name}
              {...register("name")}
            />
            <TextField
              label="Số điện thoại"
              inputMode="tel"
              error={formState.errors.phone?.message ?? serverErrors.phone}
              {...register("phone")}
            />
            <TextField
              label="Email"
              inputMode="email"
              error={formState.errors.email?.message ?? serverErrors.email}
              {...register("email")}
            />
            <TextField
              label="Mã số thuế"
              error={formState.errors.tax_code?.message ?? serverErrors.tax_code}
              {...register("tax_code")}
            />
            {selectedType === "COMPANY" ? (
              <TextField
                label="Ngày thành lập"
                type="date"
                error={formState.errors.founded_date?.message ?? serverErrors.founded_date}
                {...register("founded_date")}
              />
            ) : (
              <>
                <TextField
                  label="Ngày sinh"
                  type="date"
                  error={formState.errors.date_of_birth?.message ?? serverErrors.date_of_birth}
                  {...register("date_of_birth")}
                />
                <Select
                  label="Giới tính"
                  error={formState.errors.gender?.message ?? serverErrors.gender}
                  {...register("gender")}
                >
                  <option value="">— Chọn —</option>
                  {GENDER_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {GENDER_LABELS[value]}
                    </option>
                  ))}
                </Select>
                <TextField
                  label="Nghề nghiệp"
                  error={formState.errors.occupation?.message ?? serverErrors.occupation}
                  {...register("occupation")}
                />
              </>
            )}
            <div className="md:col-span-2">
              <Textarea
                label="Địa chỉ"
                error={formState.errors.address?.message ?? serverErrors.address}
                {...register("address")}
              />
            </div>
            <div className="md:col-span-2">
              <Textarea label="Ghi chú" error={serverErrors.note} {...register("note")} />
            </div>
          </FieldGroup>

          {selectedType === "COMPANY" ? (
            <>
              <FieldGroup>
                <TextField
                  label="Người liên hệ"
                  error={formState.errors.contact_person?.message ?? serverErrors.contact_person}
                  {...register("contact_person")}
                />
                <TextField
                  label="SĐT người liên hệ"
                  inputMode="tel"
                  error={
                    formState.errors.contact_person_phone?.message ??
                    serverErrors.contact_person_phone
                  }
                  {...register("contact_person_phone")}
                />
              </FieldGroup>
              <FieldGroup>
                <TextField
                  label="Giám đốc"
                  error={formState.errors.director_name?.message ?? serverErrors.director_name}
                  {...register("director_name")}
                />
                <TextField
                  label="SĐT giám đốc"
                  inputMode="tel"
                  error={formState.errors.director_phone?.message ?? serverErrors.director_phone}
                  {...register("director_phone")}
                />
              </FieldGroup>
              <FieldGroup>
                <TextField
                  label="Phụ trách IT"
                  error={formState.errors.it_contact_name?.message ?? serverErrors.it_contact_name}
                  {...register("it_contact_name")}
                />
                <TextField
                  label="SĐT phụ trách IT"
                  inputMode="tel"
                  error={
                    formState.errors.it_contact_phone?.message ?? serverErrors.it_contact_phone
                  }
                  {...register("it_contact_phone")}
                />
              </FieldGroup>
            </>
          ) : null}
        </form>
      )}
    </Sheet>
  );
}
