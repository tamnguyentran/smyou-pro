import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useForm } from "react-hook-form";
import { BrandHeader } from "../../../components/BrandHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { PasswordField } from "../../../components/ui/PasswordField";
import { TextField } from "../../../components/ui/TextField";
import { useLogin } from "../api";
import { fieldErrors, formError } from "../errors";
import { loginSchema, type LoginValues } from "../schemas";

export function LoginPage() {
  const login = useLogin();
  const { register, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });
  const server = fieldErrors(login.error);
  const onSubmit = handleSubmit((values) => {
    login.mutate(values);
  });

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full rounded-2xl border border-line bg-card p-6 shadow-card md:max-w-md md:p-8">
        <BrandHeader />
        <h2 className="mt-6 text-lg font-semibold text-heading lg:text-xl">Đăng nhập</h2>
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
          {formError(login.error) ? <Alert>{formError(login.error)}</Alert> : null}
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
