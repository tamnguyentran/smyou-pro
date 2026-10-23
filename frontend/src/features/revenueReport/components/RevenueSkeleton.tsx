/** Skeleton đúng hình dạng bảng/card doanh thu khi đang gọi API (spec §3, UI_GUIDELINES.md). */
export function RevenueSkeleton() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải báo cáo doanh thu"
      className="space-y-3"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-20 w-full animate-pulse rounded-2xl bg-sidebar-sub" />
      ))}
    </div>
  );
}
