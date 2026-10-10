/** Biết trước dạng hiển thị từ `roles` (GET /me), không cần đợi GET /api/v1/kpi/report (spec §6). */
export function KpiSkeleton({ isSelf }: { isSelf: boolean }) {
  const count = isSelf ? 4 : 3;
  return (
    <div role="group" aria-busy="true" aria-label="Đang tải báo cáo KPI" className="space-y-3">
      <div className="h-11 w-full animate-pulse rounded-xl bg-sidebar-sub" />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-20 w-full animate-pulse rounded-2xl bg-sidebar-sub" />
      ))}
    </div>
  );
}
