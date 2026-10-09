function Tiles({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-20 w-full animate-pulse rounded-2xl bg-sidebar-sub" />
      ))}
    </div>
  );
}

/** Biết trước số khối cần hiện từ `roles` (GET /me), không cần đợi GET /api/v1/dashboard (spec §6). */
export function DashboardSkeleton({ roles }: { roles: string[] }) {
  const hasOrder = roles.includes("SALE") || roles.includes("MANAGER");
  const hasDispatch = roles.includes("TECH_LEAD") || roles.includes("MANAGER");
  const hasToday = roles.includes("TECHNICIAN");
  return (
    <div role="group" aria-busy="true" aria-label="Đang tải tổng quan" className="space-y-6">
      {hasOrder ? <Tiles count={7} /> : null}
      {hasDispatch ? <Tiles count={3} /> : null}
      {hasToday ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-28 w-full animate-pulse rounded-2xl bg-sidebar-sub" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
