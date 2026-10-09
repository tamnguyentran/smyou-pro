import { CheckCheck, Bell as BellIcon } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { useMe } from "../../me/api";
import { useMarkAllRead, useNotifications } from "../api";
import { NotificationList } from "../components/NotificationList";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách thông báo"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** Trang `/thong-bao` (spec M7-01b) — capability `notification.read` (mọi vai trò có `self`). */
export function NotificationsPage() {
  usePageTitle("Thông báo");
  const me = useMe();
  const [offset, setOffset] = useState(0);
  const notifications = useNotifications({ limit: PAGE_SIZE, offset });
  const markAllRead = useMarkAllRead();

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
  if (!("notification.read" in me.data.capabilities)) return <ForbiddenPage />;

  const unreadCount = me.data.unread_notifications_count;

  return (
    <div className="space-y-4">
      {unreadCount > 0 ? (
        <Button
          variant="secondary"
          loading={markAllRead.isPending}
          icon={<CheckCheck aria-hidden="true" className="size-4" />}
          onClick={() => {
            markAllRead.mutate();
          }}
        >
          Đánh dấu tất cả đã đọc
        </Button>
      ) : null}

      {notifications.isPending ? (
        <Waiting />
      ) : notifications.isError ? (
        <EmptyState
          icon={BellIcon}
          message="Không tải được danh sách thông báo."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void notifications.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : notifications.data.items.length === 0 ? (
        <EmptyState icon={BellIcon} message="Chưa có thông báo." />
      ) : (
        <>
          <NotificationList items={notifications.data.items} />
          <Pagination
            total={notifications.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}
    </div>
  );
}
