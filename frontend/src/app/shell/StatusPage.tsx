import { Construction, SearchX, ShieldX, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { usePageTitle } from "./pageTitle";

function StatusPage({
  title,
  icon: Icon,
  message,
}: {
  title: string;
  icon: LucideIcon;
  message: string;
}) {
  usePageTitle(title);
  return (
    <section className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <Icon aria-hidden="true" className="size-12 text-muted" />
      <p className="text-sm leading-relaxed text-body">{message}</p>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Về trang chủ
      </Link>
    </section>
  );
}

export function ForbiddenPage() {
  return (
    <StatusPage
      title="Không có quyền truy cập"
      icon={ShieldX}
      message="Bạn không có quyền truy cập trang này."
    />
  );
}

export function NotFoundPage() {
  return <StatusPage title="Không tìm thấy trang" icon={SearchX} message="Không tìm thấy trang." />;
}

/** Placeholder for a menu page whose feature is not built yet (Q27). */
export function ComingSoonPage({ title, icon }: { title: string; icon?: LucideIcon }) {
  return (
    <StatusPage
      title={title}
      icon={icon ?? Construction}
      message="Tính năng đang được phát triển."
    />
  );
}
