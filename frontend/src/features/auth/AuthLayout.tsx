import type { ReactNode } from "react";

/**
 * Full-screen frame shared by Đăng nhập / Quên mật khẩu / Đặt lại mật khẩu (M22-01).
 * The background image is a CSS background behind `md:` so phones (< 768px) never download it.
 * The url is resolved by Vite relative to src/styles/index.css, where Tailwind emits the rule.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-cover bg-center p-4 md:bg-[url(../assets/login-bg-deepmind.webp)]">
      {children}
    </main>
  );
}
