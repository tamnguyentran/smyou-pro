import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, KeyRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BrandHeader } from "../../../components/BrandHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PasswordField } from "../../../components/ui/PasswordField";
import { useToast } from "../../../components/ui/Toast";
import { useDocumentTitle } from "../../../lib/useDocumentTitle";
import { useResetPassword } from "../api";
import { ApiError, fieldErrors, formError } from "../errors";
import { resetPasswordSchema, type ResetPasswordValues } from "../schemas";

const INVALID_LINK_MESSAGE = "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.";

function InvalidLink() {
  return (
    <EmptyState
      icon={AlertCircle}
      message={INVALID_LINK_MESSAGE}
      action={
        <Link
          to="/quen-mat-khau"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Gửi lại yêu cầu
        </Link>
      }
    />
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const resetPassword = useResetPassword();
  const toast = useToast();
  const navigate = useNavigate();
  const { register, handleSubmit, formState } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });
  const server = fieldErrors(resetPassword.error);
  const formMessage = formError(resetPassword.error, ["new_password"]);
  const invalidToken =
    resetPassword.error instanceof ApiError &&
    resetPassword.error.problem.code === "INVALID_RESET_TOKEN";
  useDocumentTitle("Đặt lại mật khẩu");
  const onSubmit = handleSubmit((values) => {
    if (!token) return;
    resetPassword.mutate(
      { token, new_password: values.new_password },
      {
        onSuccess: () => {
          toast("Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.");
          void navigate("/dang-nhap");
        },
      },
    );
  });

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full rounded-2xl bg-card p-7 shadow-card md:max-w-md md:p-8">
        <BrandHeader />
        <h2 className="mt-6 text-lg font-semibold text-heading lg:text-xl">Đặt lại mật khẩu</h2>
        {!token || invalidToken ? (
          <InvalidLink />
        ) : (
          <form noValidate onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
            {formMessage ? <Alert>{formMessage}</Alert> : null}
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
              loading={resetPassword.isPending}
              icon={<KeyRound aria-hidden="true" className="size-4" />}
              className="w-full"
            >
              Đặt lại mật khẩu
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
