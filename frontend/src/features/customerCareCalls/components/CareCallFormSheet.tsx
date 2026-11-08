import { zodResolver } from "@hookform/resolvers/zod";
import { Save, X } from "lucide-react";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { Textarea } from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/Toast";
import { ApiError, formError } from "../../auth/errors";
import { fieldErrors } from "../../customers/errors";
import { CustomerSearchPicker } from "../../orders/components/CustomerPicker";
import { useRecordCareCall } from "../api";
import { careCallSchema, type CareCallFormValues } from "../schemas";

const FORM_ID = "care-call-form";
const SHOWN_FIELDS = ["customer_id", "offered", "customer_request"] as const;

/** AC-CUS-071..074: sheet "Ghi nhận cuộc gọi" — khách hàng dùng lại ô chọn khách của đơn hàng (kể cả
 * "Thêm khách hàng"); lỗi client focus ô đầu tiên, lỗi 422 của
 * server gắn vào đúng ô. */
export function CareCallFormSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const record = useRecordCareCall();
  const [customer, setCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const { register, handleSubmit, formState, control, setError } = useForm<CareCallFormValues>({
    resolver: zodResolver(careCallSchema),
    defaultValues: { customer_id: "", offered: "", customer_request: "" },
  });
  // Registered here, before the `register(...)` spreads in the JSX: RHF focuses the first invalid
  // field in registration order, and the customer box comes first on screen (AC-CUS-072).
  const { field: customerField } = useController({ control, name: "customer_id" });

  const onSubmit = handleSubmit(async (values) => {
    setFormMessage(null);
    try {
      await record.mutateAsync({
        customer_id: values.customer_id,
        offered: values.offered,
        customer_request: values.customer_request === "" ? null : values.customer_request,
      });
      toast("Đã ghi nhận cuộc gọi.");
      onClose();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormMessage("Không thực hiện được. Vui lòng thử lại.");
        return;
      }
      setFormMessage(formError(error, SHOWN_FIELDS));
      const errors = fieldErrors(error);
      for (const field of SHOWN_FIELDS) {
        const message = errors[field];
        if (message) setError(field, { message });
      }
    }
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title="Ghi nhận cuộc gọi"
      wide
      dismissible={!record.isPending}
      footer={
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            icon={<X aria-hidden="true" className="size-4" />}
            disabled={record.isPending}
            onClick={onClose}
          >
            Huỷ
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            className="flex-1"
            icon={<Save aria-hidden="true" className="size-4" />}
            loading={record.isPending}
          >
            Lưu
          </Button>
        </div>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-4"
      >
        {formMessage ? <Alert>{formMessage}</Alert> : null}
        <CustomerSearchPicker
          label="Khách hàng"
          customerId={customerField.value}
          customerName={customer?.name}
          customerPhone={customer?.phone}
          error={formState.errors.customer_id?.message}
          inputRef={customerField.ref}
          onChange={(picked) => {
            setCustomer(picked);
            customerField.onChange(picked?.id ?? "");
          }}
        />
        <Textarea
          label="Chào sản phẩm/dịch vụ"
          rows={3}
          error={formState.errors.offered?.message}
          {...register("offered")}
        />
        <Textarea
          label="Ghi nhận yêu cầu của KH (nếu có)"
          rows={3}
          error={formState.errors.customer_request?.message}
          {...register("customer_request")}
        />
      </form>
    </Sheet>
  );
}
