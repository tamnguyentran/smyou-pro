import { CircleHelp } from "lucide-react";
import { Link } from "react-router";

/** M26-01 (AC-HELP-001): nút ? bên trái chuông ở header desktop + mobile — mở `/huong-dan`. */
export function HelpButton() {
  return (
    <Link
      to="/huong-dan"
      aria-label="Hướng dẫn sử dụng"
      title="Hướng dẫn sử dụng"
      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-heading hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <CircleHelp aria-hidden="true" className="size-6" />
    </Link>
  );
}
