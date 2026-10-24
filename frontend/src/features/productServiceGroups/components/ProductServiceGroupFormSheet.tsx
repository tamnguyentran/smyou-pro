import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Sheet } from "../../../components/ui/Sheet";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { ApiError, formError } from "../../auth/errors";
import {
  useActivateProductServiceGroup,
  useCreateProductServiceGroup,
  useDeactivateProductServiceGroup,
  useUpdateProductServiceGroup,
  type ProductServiceGroup,
} from "../api";
import { fieldErrors } from "../errors";
import { productServiceGroupSchema, type ProductServiceGroupFormValues } from "../schemas";
import { StatusBadge } from "./ProductServiceGroupList";

type ConfirmKind = "deactivate" | "activate" | null;
const SHOWN_FIELDS = ["name"];
const FORM_ID = "product-service-group-form";

/** AC-CAT-090…094, 097: tạo/sửa nhóm, ngừng/mở hoạt động — rút gọn từ `ProductFormSheet`
 * (chỉ có "Tên nhóm", không giá/ảnh/danh mục con). */
export function ProductServiceGroupFormSheet({
  onClose,
  group: initialGroup,
  canManage,
}: {
  onClose: () => void;
  group?: ProductServiceGroup;
  canManage: boolean;
}) {
  const [group, setGroup] = useState<ProductServiceGroup | undefined>(initialGroup);
  const readOnly = group !== undefined && !canManage;
  const toast = useToast();
  const create = useCreateProductServiceGroup();
  const update = useUpdateProductServiceGroup();
  const deactivate = useDeactivateProductServiceGroup();
  const activate = useActivateProductServiceGroup();

  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [showReload, setShowReload] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmKind>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<ProductServiceGroupFormValues>({
    resolver: zodResolver(productServiceGroupSchema),
    defaultValues: { name: group?.name ?? "" },
  });

  const title = group ? (readOnly ? "Chi tiết nhóm" : "Sửa nhóm") : "Thêm nhóm";

  const onSubmit = handleSubmit(async (values) => {
    setServerErrors({});
    setFormMessage(null);
    setShowReload(false);
    try {
      if (!group) {
        const created = await create.mutateAsync({ name: values.name });
        toast(`Đã thêm nhóm ${created.name}.`);
        onClose();
        return;
      }
      const updated = await update.mutateAsync({
        id: group.id,
        body: { version: group.version, name: values.name },
      });
      setGroup(updated);
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
    if (!group) return;
    setConfirmError(null);
    try {
      if (confirming === "deactivate") {
        setGroup(await deactivate.mutateAsync({ id: group.id, version: group.version }));
      } else if (confirming === "activate") {
        setGroup(await activate.mutateAsync({ id: group.id, version: group.version }));
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
                onClose();
              }}
            >
              Tải lại
            </Button>
          ) : (
            <Button type="submit" form={FORM_ID} loading={create.isPending || update.isPending}>
              Lưu
            </Button>
          )
        }
      >
        {readOnly ? (
          <dl className="divide-y divide-line">
            <div className="flex justify-between gap-4 py-2 text-sm">
              <dt className="text-muted">Tên nhóm</dt>
              <dd className="font-medium text-heading">{group.name}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2 text-sm">
              <dt className="text-muted">Trạng thái</dt>
              <dd>
                <StatusBadge group={group} />
              </dd>
            </div>
          </dl>
        ) : (
          <form
            id={FORM_ID}
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            className="space-y-4"
          >
            {formMessage ? <Alert>{formMessage}</Alert> : null}
            <TextField
              label="Tên nhóm"
              error={formState.errors.name?.message ?? serverErrors.name}
              {...register("name")}
            />
            {group ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Trạng thái:</span>
                <StatusBadge group={group} />
              </div>
            ) : null}
            {group && canManage ? (
              <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                {group.is_active ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setConfirming("deactivate");
                    }}
                  >
                    Ngừng hoạt động
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setConfirming("activate");
                    }}
                  >
                    Mở lại hoạt động
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
          title={confirming === "deactivate" ? "Ngừng hoạt động" : "Mở lại hoạt động"}
          message={
            confirming === "deactivate"
              ? "Nhóm sẽ không hiện trong danh sách chọn khi tạo đơn mới."
              : "Nhóm sẽ hiện lại trong danh sách chọn khi tạo đơn mới."
          }
          confirmLabel={confirming === "deactivate" ? "Ngừng hoạt động" : "Mở lại hoạt động"}
          onConfirm={() => void runConfirm()}
          loading={confirmRunning}
          error={confirmError}
        />
      ) : null}
    </>
  );
}
