import {
  BarChart3,
  CalendarRange,
  ClipboardCheck,
  FilePlus2,
  Hammer,
  History,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  ListOrdered,
  Monitor,
  Package,
  Plus,
  RotateCcw,
  ShoppingBag,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { createElement } from "react";
import navigation from "./menu.json";

/** Generated from spec/permissions.yaml by `make contract` (AC-SYS-034) — never edit menu.json by hand. */
export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  path: string | null;
  capability: string | null;
  badge: string | null;
  children: MenuItem[];
}
interface PrimaryAction {
  label: string;
  icon: string;
  path: string;
}

export const MENU: MenuItem[] = navigation.menu;
export const ROLE_LABELS: Record<string, string> = navigation.roles;
const PRIMARY_ACTIONS: Record<string, PrimaryAction | null> =
  navigation.mobile_bottom_nav.primary_action;
/** permissions.yaml `mobile_bottom_nav`: the highest-priority role decides the main action (Q28). */
const ROLE_PRIORITY = ["TECH_LEAD", "SALE", "MANAGER", "TECHNICIAN"];

const ICONS: Record<string, LucideIcon> = {
  BarChart3,
  CalendarRange,
  ClipboardCheck,
  FilePlus2,
  Hammer,
  History,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  ListOrdered,
  Monitor,
  Package,
  Plus,
  RotateCcw,
  ShoppingBag,
  UserCog,
  Users,
  Wrench,
};

export function menuIcon(name: string): LucideIcon {
  return ICONS[name] ?? LayoutDashboard;
}

/** The lucide icon named in permissions.yaml. */
export function MenuItemIcon({ name, ...props }: LucideProps & { name: string }) {
  return createElement(menuIcon(name), props);
}

type Capabilities = Record<string, unknown>;
const holds = (capabilities: Capabilities, capability: string | null) =>
  capability === null || capability in capabilities;

/** The menu projected on the caller's capabilities: a child also needs its own capability, if any. */
export function visibleMenu(capabilities: Capabilities, items: MenuItem[] = MENU): MenuItem[] {
  return items.flatMap((item) => {
    if (!holds(capabilities, item.capability)) return [];
    if (!item.children.length) return [item];
    const children = item.children.filter((child) => holds(capabilities, child.capability));
    return children.length ? [{ ...item, children }] : [];
  });
}

/** Every page reachable from the menu, with the capabilities it needs (parent's and its own). */
export function menuPages(items: MenuItem[] = MENU, inherited: string[] = []) {
  return items.flatMap((item): { item: MenuItem; capabilities: string[] }[] => {
    const capabilities = item.capability ? [...inherited, item.capability] : inherited;
    const self = item.path ? [{ item, capabilities }] : [];
    return [...self, ...menuPages(item.children, capabilities)];
  });
}

export function roleLabels(roles: string[]): string {
  return Object.keys(ROLE_LABELS)
    .filter((role) => roles.includes(role))
    .map((role) => ROLE_LABELS[role])
    .join(" · ");
}

export function primaryAction(roles: string[]): PrimaryAction | null {
  const role = ROLE_PRIORITY.find((r) => roles.includes(r) && PRIMARY_ACTIONS[r]);
  return role ? (PRIMARY_ACTIONS[role] ?? null) : null;
}
