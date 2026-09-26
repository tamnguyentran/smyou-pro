import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import { cn } from "../../lib/cn";
import { MenuItemIcon, type MenuItem } from "../menu";

type Counters = Record<string, number>;

function Badge({ count }: { count: number | undefined }) {
  if (!count) return null;
  // The leading space keeps the link's accessible name "Đơn chờ điều phối 4 mục".
  return (
    <>
      {" "}
      <span
        role="img"
        aria-label={`${String(count)} mục`}
        className="ml-auto min-w-6 rounded-full bg-accent-light px-2 py-0.5 text-center text-xs font-semibold text-heading tabular-nums"
      >
        {count > 99 ? "99+" : count}
      </span>
    </>
  );
}

const rowClass =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

function Leaf({
  item,
  counters,
  onNavigate,
}: {
  item: MenuItem;
  counters: Counters;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={item.path ?? "/"}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(rowClass, isActive ? "bg-brand text-white" : "text-body hover:bg-sidebar-sub")
      }
    >
      {({ isActive }) => (
        <>
          <MenuItemIcon
            name={item.icon}
            aria-hidden="true"
            className={cn("size-5 shrink-0", isActive ? "text-accent" : "text-muted")}
          />
          <span data-menu-label>{item.label}</span>
          <Badge count={item.badge ? counters[item.badge] : undefined} />
        </>
      )}
    </NavLink>
  );
}

function Group({
  item,
  counters,
  onNavigate,
}: {
  item: MenuItem;
  counters: Counters;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const active = item.children.some((c) => c.path === pathname);
  const [open, setOpen] = useState(active);
  // Open when navigation lands on a child (top-bar button, Back, deep link); closing stays manual.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setOpen(true);
  }
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className={cn(rowClass, "text-body hover:bg-sidebar-sub")}
      >
        <MenuItemIcon name={item.icon} aria-hidden="true" className="size-5 shrink-0 text-muted" />
        <span data-menu-label>{item.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("ml-auto size-4 text-muted transition duration-200", open && "rotate-180")}
        />
      </button>
      {open ? (
        <ul className="mt-1 ml-4 space-y-1 border-l-2 border-line pl-4">
          {item.children.map((child) => (
            <li key={child.id}>
              <Leaf item={child} counters={counters} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Two-level role menu (UI_GUIDELINES §3): items are already filtered by the caller's capabilities. */
export function NavMenu({
  items,
  counters,
  onNavigate,
}: {
  items: MenuItem[];
  counters: Counters;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Menu chính">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            {item.children.length ? (
              <Group item={item} counters={counters} onNavigate={onNavigate} />
            ) : (
              <Leaf item={item} counters={counters} onNavigate={onNavigate} />
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
