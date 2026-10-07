import { Inbox } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useToast } from "../../../components/ui/Toast";
import { cn } from "../../../lib/cn";
import { ApiError } from "../../auth/errors";
import { useMe } from "../../me/api";
import {
  useAcceptAssignment,
  useMyAssignments,
  useRejectAssignment,
  type AssignmentRejectBody,
  type MyAssignment,
} from "../api";
import { MyAssignmentList } from "../components/MyAssignmentList";
import { RejectAssignmentSheet } from "../components/RejectAssignmentSheet";

const GENERIC_ERROR = "Không thực hiện được. Vui lòng thử lại.";

function describeError(error: unknown): string {
  return error instanceof ApiError ? (error.problem.detail ?? GENERIC_ERROR) : GENERIC_ERROR;
}

type TabId = "pending" | "active" | "done";
interface Tab {
  label: string;
  statuses: readonly string[];
  empty: string;
}

const TAB_ORDER: readonly TabId[] = ["pending", "active", "done"];
const TABS: Record<TabId, Tab> = {
  pending: {
    statuses: ["PENDING"],
    label: "Chờ nhận",
    empty: "Không có đầu việc nào đang chờ tiếp nhận.",
  },
  active: {
    statuses: ["ACCEPTED", "IN_PROGRESS"],
    label: "Đang làm",
    empty: "Không có đầu việc nào đang làm.",
  },
  done: { statuses: ["DONE"], label: "Đã xong", empty: "Không có đầu việc nào đã hoàn thành." },
};

function Waiting() {
  return (
    <div role="group" aria-busy="true" aria-label="Đang tải việc của tôi" className="space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-28 w-full animate-pulse rounded-2xl bg-sidebar-sub" />
      ))}
    </div>
  );
}

function countByTab(items: MyAssignment[], statuses: readonly string[]): number {
  return items.filter((item) => statuses.includes(item.assignment_status)).length;
}

/** AC-ASG-008…014/017…041: trang `/my-tasks` — capability `assignment.respond`, API của M5-01/M5-02. */
export function MyTasksPage() {
  usePageTitle("Việc của tôi");
  const toast = useToast();
  const me = useMe();
  const [tab, setTab] = useState<TabId>("pending");
  const allowed = me.data !== undefined && "assignment.respond" in me.data.capabilities;
  const assignments = useMyAssignments({ enabled: allowed });
  const acceptAssignment = useAcceptAssignment();
  const rejectAssignment = useRejectAssignment();
  const [acceptStale, setAcceptStale] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<MyAssignment | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectStale, setRejectStale] = useState(false);

  function handleAccept(item: MyAssignment) {
    setAcceptStale(false);
    acceptAssignment.mutate(
      { assignmentId: item.assignment_id, body: { version: item.order_version } },
      {
        onSuccess: () => {
          toast("Đã tiếp nhận đầu việc.");
        },
        onError: (error: unknown) => {
          if (error instanceof ApiError && error.problem.code === "STALE_VERSION") {
            setAcceptStale(true);
          } else {
            toast(describeError(error));
          }
        },
      },
    );
  }

  function submitReject(reasonCode: AssignmentRejectBody["reason_code"], reasonText: string) {
    if (rejectTarget === null) return;
    setRejectError(null);
    rejectAssignment.mutate(
      {
        assignmentId: rejectTarget.assignment_id,
        body: {
          version: rejectTarget.order_version,
          reason_code: reasonCode,
          reason_text: reasonText,
        },
      },
      {
        onSuccess: () => {
          setRejectTarget(null);
          toast("Đã từ chối đầu việc.");
        },
        onError: (error: unknown) => {
          if (error instanceof ApiError && error.problem.code === "STALE_VERSION") {
            setRejectStale(true);
          } else {
            setRejectError(describeError(error));
          }
        },
      },
    );
  }

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <Waiting />;
  if (!allowed) return <ForbiddenPage />;

  const activeTab = TABS[tab];
  const items = assignments.data?.items ?? [];
  const tabItems = items.filter((item) => activeTab.statuses.includes(item.assignment_status));

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Việc của tôi" className="flex gap-2 overflow-x-auto">
        {TAB_ORDER.map((id) => (
          <button
            key={id}
            id={`my-tasks-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="my-tasks-tabpanel"
            onClick={() => {
              setTab(id);
            }}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition duration-200",
              tab === id
                ? "border-brand bg-brand text-white"
                : "border-line bg-card text-body hover:bg-sidebar-sub",
            )}
          >
            {TABS[id].label}
            {assignments.data ? ` (${String(countByTab(items, TABS[id].statuses))})` : ""}
          </button>
        ))}
      </div>

      {acceptStale ? (
        <Alert>
          Thông tin đã bị người khác thay đổi. Vui lòng tải lại.{" "}
          <Button
            variant="secondary"
            onClick={() => {
              setAcceptStale(false);
              void assignments.refetch();
            }}
          >
            Tải lại
          </Button>
        </Alert>
      ) : null}

      <div role="tabpanel" id="my-tasks-tabpanel" aria-labelledby={`my-tasks-tab-${tab}`}>
        {assignments.isPending ? (
          <Waiting />
        ) : assignments.isError ? (
          <EmptyState
            icon={Inbox}
            message="Không tải được danh sách đầu việc."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void assignments.refetch();
                }}
              >
                Thử lại
              </Button>
            }
          />
        ) : tabItems.length === 0 ? (
          <EmptyState icon={Inbox} message={activeTab.empty} />
        ) : (
          <MyAssignmentList
            items={tabItems}
            showActions={tab === "pending"}
            acceptingId={
              acceptAssignment.isPending ? acceptAssignment.variables.assignmentId : null
            }
            onAccept={handleAccept}
            onReject={(item) => {
              setRejectError(null);
              setRejectStale(false);
              setRejectTarget(item);
            }}
          />
        )}
      </div>

      {rejectTarget ? (
        <RejectAssignmentSheet
          open
          onClose={() => {
            setRejectTarget(null);
          }}
          taskCode={rejectTarget.task_code}
          loading={rejectAssignment.isPending}
          error={rejectError}
          staleVersion={rejectStale}
          onReload={() => {
            setRejectTarget(null);
            setRejectStale(false);
            void assignments.refetch();
          }}
          onConfirm={submitReject}
        />
      ) : null}
    </div>
  );
}
