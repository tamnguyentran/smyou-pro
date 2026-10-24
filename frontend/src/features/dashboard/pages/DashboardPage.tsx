import { Inbox, RefreshCw } from "lucide-react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { cn } from "../../../lib/cn";
import { useMe } from "../../me/api";
import { useDashboard } from "../api";
import { CskhStatsSection } from "../components/CskhStatsSection";
import { DashboardSkeleton } from "../components/DashboardSkeleton";
import { DispatchSummarySection } from "../components/DispatchSummarySection";
import { FeedbackSummarySection } from "../components/FeedbackSummarySection";
import { MyTaskSummarySection } from "../components/MyTaskSummarySection";
import { OrderSummarySection } from "../components/OrderSummarySection";
import { StaffSummarySection } from "../components/StaffSummarySection";
import { TaskSummarySection } from "../components/TaskSummarySection";
import { TodayTasksSection } from "../components/TodayTasksSection";
import { TopCustomersSection } from "../components/TopCustomersSection";

/** AC-DASH-001…015 (M7-02): trang "/" — dashboard thật theo (các) vai trò, thay `HomePage` cũ. */
export function DashboardPage() {
  const me = useMe();
  const allowed = me.data !== undefined && "dashboard.read" in me.data.capabilities;
  const dashboard = useDashboard({ enabled: allowed });
  usePageTitle(
    "Tổng quan",
    allowed ? (
      <button
        type="button"
        aria-label="Làm mới"
        disabled={dashboard.isFetching}
        onClick={() => {
          void dashboard.refetch();
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-heading hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <RefreshCw
          aria-hidden="true"
          className={cn("size-5", dashboard.isFetching && "animate-spin")}
        />
      </button>
    ) : null,
  );

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
      {data.dispatch_summary ? (
        <DispatchSummarySection
          summary={data.dispatch_summary}
          canViewTaskBoard={"task.manage" in me.data.capabilities}
        />
      ) : null}
      {data.task_summary ? (
        <TaskSummarySection
          summary={data.task_summary}
          canViewTaskBoard={"task.manage" in me.data.capabilities}
        />
      ) : null}
      {data.staff_summary ? (
        <StaffSummarySection
          summary={data.staff_summary}
          canViewTaskBoard={"task.manage" in me.data.capabilities}
        />
      ) : null}
      {data.my_task_summary ? <MyTaskSummarySection summary={data.my_task_summary} /> : null}
      {data.care_summary != null &&
      data.care_staff_count != null &&
      data.orders_needing_revision_count != null ? (
        <CskhStatsSection
          careSummary={data.care_summary}
          careStaffCount={data.care_staff_count}
          ordersNeedingRevisionCount={data.orders_needing_revision_count}
        />
      ) : null}
      {data.top_customers || data.feedback_summary ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {data.top_customers ? <TopCustomersSection items={data.top_customers} /> : null}
          {data.feedback_summary ? (
            <FeedbackSummarySection summary={data.feedback_summary} />
          ) : null}
        </div>
      ) : null}
      {data.today_tasks ? <TodayTasksSection items={data.today_tasks} /> : null}
    </div>
  );
}
