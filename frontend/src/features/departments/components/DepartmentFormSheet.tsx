import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { ApiError, fieldErrors, formError } from "../../auth/errors";
import { useCreateDepartment, useRenameDepartment, type Department } from "../api";
import { StatusBadge } from "./DepartmentList";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập tên phòng ban.")
    .max(100, "Tên phòng ban tối đa 100 ký tự."),
});
type FormValues = z.infer<typeof schema>;

const SHOWN_FIELDS = ["name"];
const FORM_ID = "department-form";

/** AC-EMP-049: thêm/sửa tên phòng ban; trên thẻ mobile, ngừng/mở lại hoạt động cũng đi qua đây. */
export function DepartmentFormSheet({
  department,
  onClose,
  onToggle,
}: {
  department?: Department;
  onClose: () => void;
  onToggle: (department: Department) => void;
}) {
  const toast = useToast();
  const create = useCreateDepartment();
  const rename = useRenameDepartment();
  const saving = create.isPending || rename.isPending;

  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: department?.name ?? "" },
  });

  const onSubmit = handleSubmit(async ({ name }) => {
    setServerErrors({});
    setFormMessage(null);
    try {
      if (department) {
        await rename.mutateAsync({ id: department.id, name, version: department.version });
        toast("Đã cập nhật phòng ban.");
      } else {
        await create.mutateAsync(name);
        toast("Đã thêm phòng ban.");
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.problem.code === "STALE_VERSION") {
        setStale(true);
        setFormMessage("Dữ liệu đã thay đổi, vui lòng tải lại.");
        return;
      }
      if (error instanceof ApiError && error.problem.code === "DUPLICATE_NAME") {
        setServerErrors({ name: "Tên phòng ban đã tồn tại." });
        return;
      }
      setFormMessage(formError(error, SHOWN_FIELDS));
      setServerErrors(fieldErrors(error));
    }
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title={department ? "Sửa phòng ban" : "Thêm phòng ban"}
      dismissible={!saving}
      footer={
        stale ? (
          <Button type="button" variant="secondary" onClick={onClose}>
            Tải lại
          </Button>
        ) : (
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Huỷ
            </Button>
            <Button type="submit" form={FORM_ID} loading={saving}>
              Lưu
            </Button>
          </div>
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
          label="Tên phòng ban"
          required
          error={formState.errors.name?.message ?? serverErrors.name}
          {...register("name")}
        />
        {department ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Trạng thái:</span>
              <StatusBadge department={department} />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onToggle(department);
              }}
            >
              {department.is_active ? "Ngừng hoạt động" : "Mở lại hoạt động"}
            </Button>
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
