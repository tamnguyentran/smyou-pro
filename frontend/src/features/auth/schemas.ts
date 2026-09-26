import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Vui lòng nhập email.").pipe(z.email("Email không hợp lệ.")),
  password: z.string().min(1, "Vui lòng nhập mật khẩu."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại."),
    new_password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự."),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, {
    path: ["confirm"],
    message: "Mật khẩu nhập lại không khớp.",
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
