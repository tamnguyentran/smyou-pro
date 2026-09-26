import { Bell, LayoutDashboard, Plus, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useSession } from "../../features/auth/api";
import { useMe } from "../../features/me/api";
import { cn } from "../../lib/cn";
import { MenuItemIcon, primaryAction, secondSlot, visibleMenu } from "../menu";

function Slot({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-start gap-0.5 rounded-xl pt-1.5 text-center text-xs leading-tight font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          isActive ? "text-brand" : "text-muted",
        )
      }
    >
      {children}
      <span>{label}</span>
    </NavLink>
  );
}

function IconSlot({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <Slot to={to} label={label}>
      <Icon aria-hidden="true" className="size-6" />
    </Slot>
  );
}

/** Phone bottom navigation (UI_GUIDELINES §4, permissions.yaml `mobile_bottom_nav`, Q28). */
export function BottomNav() {
  const { data: session } = useSession();
  const me = useMe();
  const roles = session?.employee.roles ?? [];
  const second = me.data ? secondSlot(roles, visibleMenu(me.data.capabilities)) : null;
  const action = primaryAction(roles);
  return (
    <nav
      aria-label="Điều hướng nhanh"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-start gap-1 px-1 pt-1">
        <IconSlot to="/" label="Tổng quan" icon={LayoutDashboard} />
        {second?.path ? (
          <Slot to={second.path} label={second.label}>
            <MenuItemIcon name={second.icon} aria-hidden="true" className="size-6" />
          </Slot>
        ) : null}
        {action ? (
          <NavLink
            to={action.path}
            className="-mt-5 flex min-w-0 flex-1 justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-brand shadow-card-hover">
              <Plus aria-hidden="true" className="size-7 text-accent" />
            </span>
            <span className="sr-only">{action.label}</span>
          </NavLink>
        ) : null}
        <IconSlot to="/thong-bao" label="Thông báo" icon={Bell} />
        <IconSlot to="/ca-nhan" label="Cá nhân" icon={UserRound} />
      </div>
    </nav>
  );
}
