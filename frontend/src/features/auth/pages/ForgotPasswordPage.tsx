import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { BrandHeader } from "../../../components/BrandHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { TextField } from "../../../components/ui/TextField";
import { useDocumentTitle } from "../../../lib/useDocumentTitle";
import { useForgotPassword } from "../api";
import { fieldErrors, formError } from "../errors";
import { forgotPasswordSchema, type ForgotPasswordValues } from "../schemas";

export function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword();
  const { register, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });
  const server = fieldErrors(forgotPassword.error);
  const formMessage = formError(forgotPassword.error, ["email"]);
  useDocumentTitle("Quên mật khẩu");
  const onSubmit = handleSubmit((values) => {
    forgotPassword.mutate(values);
  });

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full rounded-2xl bg-card p-7 shadow-card md:max-w-md md:p-8">
        <BrandHeader />
        <h2 className="mt-6 text-lg font-semibold text-heading lg:text-xl">Quên mật khẩu</h2>
        {forgotPassword.data ? (
          <EmptyState
            icon={MailCheck}
            message={forgotPassword.data.detail}
            action={
              <Link
                to="/dang-nhap"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Về trang đăng nhập
              </Link>
            }
          />
        ) : (
          <>
            <p className="mt-1 text-sm leading-relaxed text-body">
              Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.
            </p>
            <form noValidate onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
              {formMessage ? <Alert>{formMessage}</Alert> : null}
              <TextField
                label="Email"
                type="email"
                autoComplete="username"
                inputMode="email"
                error={formState.errors.email?.message ?? server.email}
                {...register("email")}
              />
              <Button
                type="submit"
                loading={forgotPassword.isPending}
                icon={<Send aria-hidden="true" className="size-4" />}
                className="w-full"
              >
                Gửi liên kết
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
