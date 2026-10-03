import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { ApiError, formError } from "../../auth/errors";
import { useUpdateContact, type Order } from "../api";
import { fieldErrors } from "../errors";
import { orderContactSchema, type OrderContactFormValues } from "../schemas";
import type { RunOrderWrite } from "./writeQueue";

const FORM_ID = "edit-contact-form";
const SHOWN_FIELDS = [
  "customer_name",
  "customer_phone",
  "customer_email",
  "customer_tax_code",
  "service_address",
  "work_description",
];

/** AC-ORD-093/094/096/097: `PATCH /orders/{id}/contact` — same Sheet + react-hook-form + zod +
 * field-error pattern as `CustomerFormSheet`, including the "swap Lưu→Tải lại on STALE_VERSION". */
export function EditContactSheet({
  order,
  onClose,
  onReload,
  runWrite,
}: {
  order: Order;
  onClose: () => void;
  /** Already closes this sheet on the caller's side (same pattern as `CancelOrderSheet`'s
   * `onReload`) — this component only needs to trigger it. */
  onReload: () => void;
  /** Same per-order write queue `OrderLinesSection`/`AddLineSheet` use, so this save can never
   * race a pending line edit's PATCH on `order.version`. */
  runWrite: RunOrderWrite;
}) {
  const toast = useToast();
  const updateContact = useUpdateContact();
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [showReload, setShowReload] = useState(false);

  const { register, handleSubmit, formState } = useForm<OrderContactFormValues>({
    resolver: zodResolver(orderContactSchema) as Resolver<OrderContactFormValues>,
    defaultValues: {
      customer_name: order.customer_name ?? "",
      customer_phone: order.customer_phone ?? "",
      customer_email: order.customer_email ?? "",
      customer_tax_code: order.customer_tax_code ?? "",
      service_address: order.service_address,
      work_description: order.work_description,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormMessage(null);
    setServerErrors({});
    setShowReload(false);
    try {
      await runWrite((current) =>
        updateContact.mutateAsync({
          id: current.id,
          body: {
            version: current.version,
            customer_name: values.customer_name || null,
            customer_phone: values.customer_phone || null,
            customer_email: values.customer_email || null,
            customer_tax_code: values.customer_tax_code || null,
            service_address: values.service_address || null,
            work_description: values.work_description || null,
          },
        }),
      );
      toast("Đã cập nhật liên hệ.");
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

  return (
    <Sheet
      open
      onClose={onClose}
      title="Sửa liên hệ"
      dismissible={!updateContact.isPending}
      footer={
        showReload ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onReload();
            }}
          >
            Tải lại
          </Button>
        ) : (
          <Button
            type="submit"
            form={FORM_ID}
            loading={updateContact.isPending}
            disabled={Object.keys(formState.errors).length > 0}
          >
            Lưu
          </Button>
        )
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-4"
      >
        {formMessage ? <Alert>{formMessage}</Alert> : null}
        <TextField
          label="Tên khách hàng"
          error={formState.errors.customer_name?.message ?? serverErrors.customer_name}
          {...register("customer_name")}
        />
        <TextField
          label="Số điện thoại"
          inputMode="tel"
          error={formState.errors.customer_phone?.message ?? serverErrors.customer_phone}
          {...register("customer_phone")}
        />
        <TextField
          label="Email"
          inputMode="email"
          error={formState.errors.customer_email?.message ?? serverErrors.customer_email}
          {...register("customer_email")}
        />
        <TextField
          label="Mã số thuế"
          error={formState.errors.customer_tax_code?.message ?? serverErrors.customer_tax_code}
          {...register("customer_tax_code")}
        />
        <Textarea
          label="Địa chỉ thi công"
          error={formState.errors.service_address?.message ?? serverErrors.service_address}
          {...register("service_address")}
        />
        <Textarea
          label="Mô tả công việc"
          error={formState.errors.work_description?.message ?? serverErrors.work_description}
          {...register("work_description")}
        />
      </form>
    </Sheet>
  );
}
