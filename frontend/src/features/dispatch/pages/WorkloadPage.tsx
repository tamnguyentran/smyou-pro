import { Search, UserCog } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { TextField } from "../../../components/ui/TextField";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { useMe } from "../../me/api";
import { useWorkload } from "../api";
import { WorkloadList } from "../components/WorkloadList";

function Waiting({ desktop }: { desktop: boolean }) {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải tải việc theo nhân viên"
      className="space-y-3"
    >
      {Array.from({ length: desktop ? 4 : 3 }, (_, i) => (
        <div key={i} className="h-16 w-full animate-pulse rounded-2xl bg-sidebar-sub" />
      ))}
    </div>
  );
}

/** AC-DSP-101…107: trang `/dispatch/workload` — capability vào trang là `task.manage`, giống
 * `TaskBoardPage`/`DispatchQueuePage`; API `GET /api/v1/tasks/workload` đã có từ M4-04. */
export function WorkloadPage() {
  usePageTitle("Lịch & tải việc");
  const me = useMe();
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const allowed = me.data !== undefined && "task.manage" in me.data.capabilities;
  const workload = useWorkload(allowed);
  const [q, setQ] = useState("");

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <Waiting desktop={desktop} />;
  if (!allowed) return <ForbiddenPage />;

  const filteredItems = workload.data?.items.filter((item) =>
    item.full_name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      {!workload.isPending && !workload.isError && workload.data.items.length > 0 ? (
        <TextField
          label="Tìm kiếm"
          placeholder="Tên nhân viên…"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
          }}
          trailing={
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted"
            >
              <Search className="size-4" />
            </span>
          }
        />
      ) : null}
      {workload.isPending ? (
        <Waiting desktop={desktop} />
      ) : workload.isError ? (
        <EmptyState
          icon={UserCog}
          message="Không tải được tải việc theo nhân viên."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void workload.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : workload.data.items.length === 0 ? (
        <EmptyState icon={UserCog} message="Chưa có kỹ thuật viên nào đang hoạt động." />
      ) : filteredItems !== undefined && filteredItems.length === 0 ? (
        <EmptyState icon={UserCog} message="Không tìm thấy nhân viên phù hợp." />
      ) : (
        <WorkloadList items={filteredItems ?? workload.data.items} />
      )}
    </div>
  );
}
