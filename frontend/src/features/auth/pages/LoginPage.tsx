import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { BrandHeader } from "../../../components/BrandHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { PasswordField } from "../../../components/ui/PasswordField";
import { TextField } from "../../../components/ui/TextField";
import { useDocumentTitle } from "../../../lib/useDocumentTitle";
import { useLogin } from "../api";
import { fieldErrors, formError } from "../errors";
import { loginSchema, type LoginValues } from "../schemas";

export function LoginPage() {
  const login = useLogin();
  const { register, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });
  const server = fieldErrors(login.error);
  const formMessage = formError(login.error, ["email", "password"]);
  useDocumentTitle("Đăng nhập");
  const onSubmit = handleSubmit((values) => {
    login.mutate(values);
  });

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full rounded-2xl bg-card p-7 shadow-card md:max-w-md md:p-8">
        <BrandHeader />
        <h2 className="mt-6 text-lg font-semibold text-heading lg:text-xl">Đăng nhập</h2>
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
          <PasswordField
            label="Mật khẩu"
            autoComplete="current-password"
            error={formState.errors.password?.message ?? server.password}
            {...register("password")}
          />
          <Link
            to="/quen-mat-khau"
            className="inline-flex min-h-11 items-center text-sm text-brand underline-offset-2 hover:underline"
          >
            Quên mật khẩu?
          </Link>
          <Button
            type="submit"
            loading={login.isPending}
            icon={<LogIn aria-hidden="true" className="size-4" />}
            className="w-full"
          >
            Đăng nhập
          </Button>
        </form>
      </section>
    </main>
  );
}
