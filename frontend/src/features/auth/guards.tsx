import type { ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { useSession } from "./api";
import { safeNext } from "./next";

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
  const location = useLocation();
  if (isPending) return <PageSkeleton />;
  if (!session) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/dang-nhap?next=${next}`} replace />;
  }
  if (session.must_change_password && !pendingPasswordOk)
    return <Navigate to="/doi-mat-khau" replace />;
  return children;
}

/** The sign-in page: once a session exists, leave for `next` (or the forced password change). */
export function SignedOutOnly({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const [params] = useSearchParams();
  if (isPending) return <PageSkeleton />;
  if (session) {
    return (
      <Navigate
        to={session.must_change_password ? "/doi-mat-khau" : safeNext(params.get("next"))}
        replace
      />
    );
  }
  return children;
}
