import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { BrandHeader } from "../../../components/BrandHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { PasswordField } from "../../../components/ui/PasswordField";
import { useToast } from "../../../components/ui/Toast";
import { useChangePassword, useSession } from "../api";
import { fieldErrors, formError } from "../errors";
import { changePasswordSchema, type ChangePasswordValues } from "../schemas";

export function ChangePasswordPage() {
  const { data: session } = useSession();
  const change = useChangePassword();
  const toast = useToast();
  const navigate = useNavigate();
  const { register, handleSubmit, formState } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  });
  const server = fieldErrors(change.error);
  const onSubmit = handleSubmit(({ current_password, new_password }) => {
    change.mutate(
      { current_password, new_password },
      {
        onSuccess: () => {
          toast("Đã đổi mật khẩu.");
          void navigate("/", { replace: true });
        },
      },
    );
  });

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full rounded-2xl border border-line bg-card p-6 shadow-card md:max-w-md md:p-8">
        <BrandHeader />
        <h2 className="mt-6 text-lg font-semibold text-heading lg:text-xl">Đổi mật khẩu</h2>
        {session?.must_change_password ? (
          <p className="mt-1 text-sm leading-relaxed text-body">
            Đây là lần đăng nhập đầu tiên. Hãy đặt mật khẩu mới chỉ bạn biết.
          </p>
        ) : null}
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
          {formError(change.error) ? <Alert>{formError(change.error)}</Alert> : null}
          <PasswordField
            label="Mật khẩu hiện tại"
            autoComplete="current-password"
            error={formState.errors.current_password?.message ?? server.current_password}
            {...register("current_password")}
          />
          <PasswordField
            label="Mật khẩu mới"
            autoComplete="new-password"
            hint="Ít nhất 8 ký tự, khác mật khẩu hiện tại, không chứa tên email."
            error={formState.errors.new_password?.message ?? server.new_password}
            {...register("new_password")}
          />
          <PasswordField
            label="Nhập lại mật khẩu mới"
            autoComplete="new-password"
            error={formState.errors.confirm?.message}
            {...register("confirm")}
          />
          <Button
            type="submit"
            loading={change.isPending}
            icon={<KeyRound aria-hidden="true" className="size-4" />}
            className="w-full"
          >
            Đổi mật khẩu
          </Button>
        </form>
      </section>
    </main>
  );
}
