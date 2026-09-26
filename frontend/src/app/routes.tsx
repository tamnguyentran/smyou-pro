import type { RouteObject } from "react-router";
import { RequireSession, SignedOutOnly } from "../features/auth/guards";
import { ChangePasswordPage } from "../features/auth/pages/ChangePasswordPage";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { HomeRoute } from "../features/home/pages/HomeRoute";

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
    path: "/",
    element: (
      <RequireSession>
        <HomeRoute />
      </RequireSession>
    ),
  },
];
