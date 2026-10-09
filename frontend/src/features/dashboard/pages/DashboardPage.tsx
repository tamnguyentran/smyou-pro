import { Inbox } from "lucide-react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useMe } from "../../me/api";
import { useDashboard } from "../api";
import { DashboardSkeleton } from "../components/DashboardSkeleton";
import { DispatchSummarySection } from "../components/DispatchSummarySection";
import { OrderSummarySection } from "../components/OrderSummarySection";
import { TodayTasksSection } from "../components/TodayTasksSection";

/** AC-DASH-001…015 (M7-02): trang "/" — dashboard thật theo (các) vai trò, thay `HomePage` cũ. */
export function DashboardPage() {
  usePageTitle("Tổng quan");
  const me = useMe();
  const allowed = me.data !== undefined && "dashboard.read" in me.data.capabilities;
  const dashboard = useDashboard({ enabled: allowed });

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <DashboardSkeleton roles={[]} />;
  if (!allowed) return null;
  if (dashboard.isPending) return <DashboardSkeleton roles={me.data.roles} />;
  if (dashboard.isError) {
    return (
      <EmptyState
        icon={Inbox}
        message="Không tải được dữ liệu tổng quan."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void dashboard.refetch();
            }}
          >
            Tải lại
          </Button>
        }
      />
    );
  }

  const data = dashboard.data;
  return (
    <div className="space-y-6">
      {data.order_summary ? <OrderSummarySection summary={data.order_summary} /> : null}
      {data.dispatch_summary ? <DispatchSummarySection summary={data.dispatch_summary} /> : null}
      {data.today_tasks ? <TodayTasksSection items={data.today_tasks} /> : null}
    </div>
  );
}
