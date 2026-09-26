import { Bell } from "lucide-react";
import { usePageTitle } from "../../../app/shell/pageTitle";

/** Placeholder until in-app notifications (M7-01). */
export function NotificationsPage() {
  usePageTitle("Thông báo");
  return (
    <section className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <Bell aria-hidden="true" className="size-12 text-muted" />
      <p className="text-sm leading-relaxed text-body">Chưa có thông báo.</p>
    </section>
  );
}
