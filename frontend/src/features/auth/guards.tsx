import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useSession } from "./api";

function PageSkeleton() {
  return (
    <main aria-busy="true" className="flex min-h-dvh items-center justify-center p-4">
      <span className="sr-only">Đang tải…</span>
      <div className="h-64 w-full animate-pulse rounded-2xl bg-sidebar-sub md:max-w-md" />
    </main>
  );
}

/** Pages that need a session. `/doi-mat-khau` is the only one allowed while a password change is pending. */
export function RequireSession({
  children,
  pendingPasswordOk = false,
}: {
  children: ReactNode;
  pendingPasswordOk?: boolean;
}) {
  const { data: session, isPending } = useSession();
  if (isPending) return <PageSkeleton />;
  if (!session) return <Navigate to="/dang-nhap" replace />;
  if (session.must_change_password && !pendingPasswordOk)
    return <Navigate to="/doi-mat-khau" replace />;
  return children;
}

/** The sign-in page: once a session exists, always land on Tổng quan (UAT-05), or the forced
 * password change. */
export function SignedOutOnly({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  if (isPending) return <PageSkeleton />;
  if (session) {
    return <Navigate to={session.must_change_password ? "/doi-mat-khau" : "/"} replace />;
  }
  return children;
}
