import type { RouteObject } from "react-router";
import { RequireSession, SignedOutOnly } from "../features/auth/guards";
import { ChangePasswordPage } from "../features/auth/pages/ChangePasswordPage";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { EmployeesPage } from "../features/employees/pages/EmployeesPage";
import { HomeRoute } from "../features/home/pages/HomeRoute";
import { NotificationsPage } from "../features/notifications/pages/NotificationsPage";
import { ProfilePage } from "../features/profile/pages/ProfilePage";
import { menuPages } from "./menu";
import { AppShell } from "./shell/AppShell";
import { MenuPage } from "./shell/MenuPage";
import { NotFoundPage } from "./shell/StatusPage";

// Menu pages other than the dashboard ("/") are placeholders until their backlog item replaces them.
// "/employees" is real (M1-04b) and checks employee.read itself — narrower than the menu entry's
// employee.manage (Q36: TECH_LEAD reads it without seeing the menu item), so it is excluded here.
const menuRoutes: RouteObject[] = menuPages()
  .filter(({ item }) => item.path !== "/" && item.path !== "/employees")
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
      { path: "/ca-nhan", element: <ProfilePage /> },
      { path: "/thong-bao", element: <NotificationsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
