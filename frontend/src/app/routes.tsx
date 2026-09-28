import type { RouteObject } from "react-router";
import { AuditPage } from "../features/audit/pages/AuditPage";
import { RequireSession, SignedOutOnly } from "../features/auth/guards";
import { ChangePasswordPage } from "../features/auth/pages/ChangePasswordPage";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { EmployeesPage } from "../features/employees/pages/EmployeesPage";
import { HomeRoute } from "../features/home/pages/HomeRoute";
import { NotificationsPage } from "../features/notifications/pages/NotificationsPage";
import { ProductsPage } from "../features/products/pages/ProductsPage";
import { ProfilePage } from "../features/profile/pages/ProfilePage";
import { menuPages } from "./menu";
import { AppShell } from "./shell/AppShell";
import { MenuPage } from "./shell/MenuPage";
import { NotFoundPage } from "./shell/StatusPage";

// Menu pages other than the dashboard ("/") are placeholders until their backlog item replaces them.
// "/employees" is real (M1-04b) and checks employee.read itself — narrower than the menu entry's
// employee.manage (Q36: TECH_LEAD reads it without seeing the menu item), so it is excluded here.
// "/audit" is real (M1-05) and checks audit.read itself, same as "/employees" above.
// "/catalog/products" is real (M2-01b) and checks catalog.read itself — narrower than the menu
// entry's catalog.manage (AC-CAT-017: Sale reads it without seeing the "Danh mục" menu item).
const REAL_PAGES = new Set(["/", "/employees", "/audit", "/catalog/products"]);
const menuRoutes: RouteObject[] = menuPages()
  .filter(({ item }) => !REAL_PAGES.has(item.path ?? ""))
  .map(({ item, capabilities }) => ({
    path: item.path ?? undefined,
    element: <MenuPage item={item} capabilities={capabilities} />,
  }));

export const routes: RouteObject[] = [
  {
    path: "/dang-nhap",
    element: (
      <SignedOutOnly>
        <LoginPage />
      </SignedOutOnly>
    ),
  },
  {
    path: "/doi-mat-khau",
    element: (
      <RequireSession pendingPasswordOk>
        <ChangePasswordPage />
      </RequireSession>
    ),
  },
  {
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <HomeRoute /> },
      ...menuRoutes,
      { path: "/employees", element: <EmployeesPage /> },
      { path: "/audit", element: <AuditPage /> },
      { path: "/catalog/products", element: <ProductsPage /> },
      { path: "/ca-nhan", element: <ProfilePage /> },
      { path: "/thong-bao", element: <NotificationsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
