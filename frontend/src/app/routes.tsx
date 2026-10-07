import type { RouteObject } from "react-router";
import { AuditPage } from "../features/audit/pages/AuditPage";
import { RequireSession, SignedOutOnly } from "../features/auth/guards";
import { ChangePasswordPage } from "../features/auth/pages/ChangePasswordPage";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { CustomersPage } from "../features/customers/pages/CustomersPage";
import { DispatchQueuePage } from "../features/dispatch/pages/DispatchQueuePage";
import { TaskBoardPage } from "../features/dispatch/pages/TaskBoardPage";
import { WorkloadPage } from "../features/dispatch/pages/WorkloadPage";
import { EmployeesPage } from "../features/employees/pages/EmployeesPage";
import { HomeRoute } from "../features/home/pages/HomeRoute";
import { MyTasksPage } from "../features/myTasks/pages/MyTasksPage";
import { NotificationsPage } from "../features/notifications/pages/NotificationsPage";
import { DraftOrderPage } from "../features/orders/pages/DraftOrderPage";
import { OrdersListPage } from "../features/orders/pages/OrdersListPage";
import { ProductsPage } from "../features/products/pages/ProductsPage";
import { ProfilePage } from "../features/profile/pages/ProfilePage";
import { ServicesPage } from "../features/services/pages/ServicesPage";
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
// "/catalog/services" is real (M2-02), same reasoning (AC-CAT-031).
// "/customers" is real (M3-01) and checks customer.read itself — narrower than the menu entry's
// customer.manage (AC-CUS-012: TECH_LEAD reads it without seeing the "Khách hàng" menu item).
// "/orders/new" is real (M3-02b) and checks order.create itself, same shape as the menu entry.
// "/orders" (list) is real (M3-03b) and checks order.read itself — narrower than the menu entry's
// order.create (Q56: TECH_LEAD reads it via direct URL without seeing the "Đơn hàng" menu item).
// "/dispatch/queue" is real (M4-01b) and checks task.manage itself — same capability as the menu entry.
// "/dispatch/board" is real (M4-03b), same capability (task.manage) as the menu entry.
// "/dispatch/workload" is real (M4-04), same capability (task.manage) as the menu entry.
// "/my-tasks" is real (M5-01) and checks assignment.respond itself, same capability as the menu entry.
const REAL_PAGES = new Set([
  "/",
  "/employees",
  "/audit",
  "/catalog/products",
  "/catalog/services",
  "/customers",
  "/orders/new",
  "/orders",
  "/dispatch/queue",
  "/dispatch/board",
  "/dispatch/workload",
  "/my-tasks",
]);
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
      { path: "/catalog/services", element: <ServicesPage /> },
      { path: "/customers", element: <CustomersPage /> },
      { path: "/dispatch/queue", element: <DispatchQueuePage /> },
      { path: "/dispatch/board", element: <TaskBoardPage /> },
      { path: "/dispatch/workload", element: <WorkloadPage /> },
      { path: "/my-tasks", element: <MyTasksPage /> },
      { path: "/orders", element: <OrdersListPage /> },
      // One route object (not two) for "/orders/new" and "/orders/:id": creating the first line
      // silently saves the draft and navigate()s from "new" to the real id — same route match, same
      // DraftOrderPage instance, so that in-flight state (the open add-line Sheet) survives the URL
      // change instead of losing it to an unmount/remount.
      { path: "/orders/:id", element: <DraftOrderPage /> },
      { path: "/ca-nhan", element: <ProfilePage /> },
      { path: "/thong-bao", element: <NotificationsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
