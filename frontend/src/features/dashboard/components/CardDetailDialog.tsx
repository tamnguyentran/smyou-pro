import { FileSpreadsheet, Inbox } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { Sheet } from "../../../components/ui/Sheet";
import { useToast } from "../../../components/ui/Toast";
import { cn } from "../../../lib/cn";
import { formatCurrency, formatDateTime, formatPhone } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import {
  CARD_PAGE_SIZE,
  downloadDashboardCard,
  useDashboardCardItems,
  type DashboardCardItems,
} from "../api";

type OrderRow = NonNullable<DashboardCardItems["order_items"]>[number];
type TaskRow = NonNullable<DashboardCardItems["task_items"]>[number];
type StaffRow = NonNullable<DashboardCardItems["staff_items"]>[number];
type FeedbackRow = NonNullable<DashboardCardItems["feedback_items"]>[number];
type CareStaffRow = NonNullable<DashboardCardItems["care_staff_items"]>[number];

/** M18-01b: nhãn trạng thái phân công của chính KTV (thẻ `mine.*`) — các nhóm của "Việc của tôi". */
const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ nhận",
  ACCEPTED: "Đã nhận",
  IN_PROGRESS: "Đang làm",
  DONE: "Đã xong",
};

function assignmentLabel(status: string | null | undefined): string {
  return status ? (ASSIGNMENT_STATUS_LABEL[status] ?? status) : "—";
}

/** Thẻ đang mở popup: mã thẻ gửi API + nhãn hiện trên thẻ (tiêu đề tạm khi đang tải). */
export type OpenCard = { card: string; label: string };

const TH = "px-3 py-2 text-left text-xs font-semibold text-muted";
const TD = "px-3 py-2.5 text-sm text-body";
/** Ô mã/ngày giờ: giữ trên 1 dòng (mã "DH-…-T1" và "dd/mm/yyyy hh:mm" không bị gãy). */
const TD_NOWRAP = cn(TD, "whitespace-nowrap");
const CODE_LINK =
  "font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** `tap`: thẻ mobile — vùng chạm ≥ 44px (link nằm giữa dòng chữ nhỏ). */
function OrderLink({ id, code, tap = false }: { id: string; code: string; tap?: boolean }) {
  return (
    <Link
      to={`/orders/${id}`}
      className={cn(CODE_LINK, tap && "inline-flex min-h-11 items-center")}
    >
      {code}
    </Link>
  );
}

function DueAt({ iso, now }: { iso: string; now: number }) {
  const overdue = new Date(iso).getTime() < now;
  return (
    <span className={cn(overdue ? "font-medium text-urgent-fg" : "text-body")}>
      {formatDateTime(iso)}
    </span>
  );
}

function OrderTable({ rows }: { rows: OrderRow[] }) {
  const showTotal = rows.every((r) => r.total !== null);
  return (
    <table className="w-full">
      <thead className="border-b border-line">
        <tr>
          <th className={TH}>Mã đơn</th>
          <th className={TH}>Khách hàng</th>
          <th className={TH}>SĐT</th>
          <th className={TH}>Người tạo</th>
          <th className={TH}>Ngày tạo</th>
          {showTotal ? <th className={cn(TH, "text-right")}>Tổng tiền</th> : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.order_id}>
            <td className={TD_NOWRAP}>
              <OrderLink id={r.order_id} code={r.order_code} />
            </td>
            <td className={TD}>{r.customer_name ?? "—"}</td>
            <td className={TD_NOWRAP}>{r.customer_phone ? formatPhone(r.customer_phone) : "—"}</td>
            <td className={TD}>{r.created_by_name}</td>
            <td className={TD_NOWRAP}>{formatDateTime(r.created_at)}</td>
            {showTotal ? (
              <td className={cn(TD, "text-right tabular-nums")}>{formatCurrency(r.total ?? 0)}</td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `personal` (thẻ "Việc của tôi"): bỏ cột KTV, thêm cột trạng thái phân công của chính người xem. */
function TaskTable({ rows, now, personal }: { rows: TaskRow[]; now: number; personal: boolean }) {
  return (
    <table className="w-full">
      <thead className="border-b border-line">
        <tr>
          <th className={TH}>Mã đầu việc</th>
          <th className={TH}>Đầu việc</th>
          <th className={TH}>Mã đơn</th>
          <th className={TH}>Khách hàng</th>
          {personal ? null : <th className={TH}>KTV</th>}
          <th className={TH}>Hạn</th>
          {personal ? <th className={cn(TH, "whitespace-nowrap")}>Trạng thái</th> : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.task_id}>
            <td className={TD_NOWRAP}>{r.task_code}</td>
            <td className={TD}>{r.task_title}</td>
            <td className={TD_NOWRAP}>
              <OrderLink id={r.order_id} code={r.order_code} />
            </td>
            <td className={TD}>{r.customer_name ?? "—"}</td>
            {personal ? null : (
              <td className={TD}>{r.assignee_names.length ? r.assignee_names.join(", ") : "—"}</td>
            )}
            <td className={TD_NOWRAP}>
              <DueAt iso={r.due_at} now={now} />
            </td>
            {personal ? (
              <td className={TD_NOWRAP}>{assignmentLabel(r.assignment_status)}</td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StaffTable({ rows }: { rows: StaffRow[] }) {
  return (
    <table className="w-full">
      <thead className="border-b border-line">
        <tr>
          <th className={TH}>Mã NV</th>
          <th className={TH}>Họ tên</th>
          <th className={TH}>SĐT</th>
          <th className={cn(TH, "text-right")}>Số việc đang mở</th>
          <th className={cn(TH, "text-right")}>Số việc đang làm</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.employee_id}>
            <td className={TD_NOWRAP}>{r.employee_code}</td>
            <td className={TD}>{r.full_name}</td>
            <td className={TD_NOWRAP}>{r.phone ? formatPhone(r.phone) : "—"}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{r.open_assignment_count}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{r.in_progress_assignment_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FeedbackTable({ rows }: { rows: FeedbackRow[] }) {
  return (
    <table className="w-full">
      <thead className="border-b border-line">
        <tr>
          <th className={TH}>Mã đơn</th>
          <th className={TH}>Khách hàng</th>
          <th className={TH}>SĐT</th>
          <th className={cn(TH, "whitespace-nowrap")}>Số sao</th>
          <th className={TH}>Nhận xét</th>
          <th className={TH}>Người ghi nhận</th>
          <th className={TH}>Thời điểm ghi nhận</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.order_id}>
            <td className={TD_NOWRAP}>
              <OrderLink id={r.order_id} code={r.order_code} />
            </td>
            <td className={TD}>{r.customer_name ?? "—"}</td>
            <td className={TD_NOWRAP}>{r.customer_phone ? formatPhone(r.customer_phone) : "—"}</td>
            <td className={TD_NOWRAP}>{`${String(r.csat_rating)}★`}</td>
            <td className={TD}>
              <span className="line-clamp-2">{r.csat_comment ?? "—"}</span>
            </td>
            <td className={TD}>{r.recorded_by_name ?? "—"}</td>
            <td className={TD_NOWRAP}>{formatDateTime(r.recorded_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CareStaffTable({ rows }: { rows: CareStaffRow[] }) {
  return (
    <table className="w-full">
      <thead className="border-b border-line">
        <tr>
          <th className={TH}>Mã NV</th>
          <th className={TH}>Họ tên</th>
          <th className={cn(TH, "text-right")}>Số KH đã chăm sóc</th>
          <th className={TH}>Lần ghi gần nhất</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.employee_id}>
            <td className={TD_NOWRAP}>{r.employee_code}</td>
            <td className={TD}>{r.full_name}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{r.care_count}</td>
            <td className={TD_NOWRAP}>{formatDateTime(r.last_recorded_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CARD_ITEM = "space-y-1 rounded-xl border border-line p-3 text-sm";

function FeedbackCards({ rows }: { rows: FeedbackRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.order_id} className={CARD_ITEM}>
          <OrderLink id={r.order_id} code={r.order_code} tap />
          <p className="text-heading">{r.customer_name ?? "—"}</p>
          <p className="font-medium text-body">{`${String(r.csat_rating)}★`}</p>
          {r.csat_comment ? <p className="line-clamp-2 text-body">{r.csat_comment}</p> : null}
          <p className="text-muted">
            {r.recorded_by_name ?? "—"} · {formatDateTime(r.recorded_at)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function CareStaffCards({ rows }: { rows: CareStaffRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.employee_id} className={CARD_ITEM}>
          <p className="font-medium text-heading">{r.full_name}</p>
          <p className="text-muted">{r.employee_code}</p>
          <p className="text-body">
            Đã chăm sóc {r.care_count} KH · {formatDateTime(r.last_recorded_at)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function OrderCards({ rows }: { rows: OrderRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.order_id} className={CARD_ITEM}>
          <OrderLink id={r.order_id} code={r.order_code} tap />
          <p className="text-heading">{r.customer_name ?? "—"}</p>
          <p className="text-muted">{formatDateTime(r.created_at)}</p>
        </li>
      ))}
    </ul>
  );
}

function TaskCards({ rows, now, personal }: { rows: TaskRow[]; now: number; personal: boolean }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.task_id} className={CARD_ITEM}>
          <p className="font-medium text-heading">{r.task_title}</p>
          <p className="text-muted">
            {r.task_code} · <OrderLink id={r.order_id} code={r.order_code} tap />
          </p>
          {personal ? (
            <p className="text-body">{assignmentLabel(r.assignment_status)}</p>
          ) : (
            <p className="text-body">
              {r.assignee_names.length ? r.assignee_names.join(", ") : "Chưa có KTV"}
            </p>
          )}
          <DueAt iso={r.due_at} now={now} />
        </li>
      ))}
    </ul>
  );
}

function StaffCards({ rows }: { rows: StaffRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.employee_id} className={CARD_ITEM}>
          <p className="font-medium text-heading">{r.full_name}</p>
          <p className="text-muted">
            {r.employee_code} · {r.phone ? formatPhone(r.phone) : "—"}
          </p>
          <p className="text-body">
            Đang mở {r.open_assignment_count} · Đang làm {r.in_progress_assignment_count}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** M18-01a/b/c: popup danh sách chi tiết của 1 thẻ Tổng quan (dòng đơn / đầu việc / nhân viên /
 * phản hồi / nhân viên CSKH). ≥1024px → hộp thoại giữa màn + bảng +
 * "Xuất Excel"; <1024px → sheet từ dưới + danh sách thẻ, không xuất file (AC-DASH-077/078). */
export function CardDetailDialog({
  open,
  onClose,
}: {
  open: OpenCard | null;
  onClose: () => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const card = open?.card ?? null;
  const query = useDashboardCardItems(card, page);
  const data = query.data;
  // "Quá hạn" so với lúc tải dữ liệu, không phải lúc mount dashboard (popup sống suốt phiên).
  const now = query.dataUpdatedAt;

  const close = () => {
    setPage(1);
    onClose();
  };

  const exportCsv = async () => {
    if (card === null) return;
    setExporting(true);
    try {
      await downloadDashboardCard(card);
    } catch {
      toast("Không xuất được file, vui lòng thử lại.");
    } finally {
      setExporting(false);
    }
  };

  const hasRows = data !== undefined && data.total > 0;
  const footer =
    hasRows && (desktop || data.total > CARD_PAGE_SIZE) ? (
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {data.total > CARD_PAGE_SIZE ? (
          <div className="lg:flex-1">
            <Pagination
              total={data.total}
              limit={CARD_PAGE_SIZE}
              offset={(page - 1) * CARD_PAGE_SIZE}
              onOffset={(offset) => {
                setPage(offset / CARD_PAGE_SIZE + 1);
              }}
            />
          </div>
        ) : null}
        {desktop ? (
          <Button
            variant="secondary"
            className="lg:ml-auto"
            loading={exporting}
            icon={<FileSpreadsheet aria-hidden="true" className="size-4" />}
            onClick={() => {
              void exportCsv();
            }}
          >
            {exporting ? "Đang xuất…" : "Xuất Excel"}
          </Button>
        ) : null}
      </div>
    ) : undefined;

  let body;
  if (query.isPending) {
    body = (
      <div className="space-y-2" aria-busy="true" aria-label="Đang tải danh sách">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-testid="card-detail-skeleton-row"
            className="h-11 animate-pulse rounded-xl bg-sidebar-sub"
          />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-body">Không tải được danh sách.</p>
        <Button
          variant="secondary"
          onClick={() => {
            void query.refetch();
          }}
        >
          Thử lại
        </Button>
      </div>
    );
  } else if (!hasRows) {
    body = <EmptyState icon={Inbox} message="Không có dữ liệu" />;
  } else if (data.kind === "order") {
    const orders = data.order_items ?? [];
    body = desktop ? <OrderTable rows={orders} /> : <OrderCards rows={orders} />;
  } else if (data.kind === "staff") {
    const staff = data.staff_items ?? [];
    body = desktop ? <StaffTable rows={staff} /> : <StaffCards rows={staff} />;
  } else if (data.kind === "feedback") {
    const feedback = data.feedback_items ?? [];
    body = desktop ? <FeedbackTable rows={feedback} /> : <FeedbackCards rows={feedback} />;
  } else if (data.kind === "care_staff") {
    const careStaff = data.care_staff_items ?? [];
    body = desktop ? <CareStaffTable rows={careStaff} /> : <CareStaffCards rows={careStaff} />;
  } else {
    const tasks = data.task_items ?? [];
    const personal = data.card.startsWith("mine.");
    body = desktop ? (
      <TaskTable rows={tasks} now={now} personal={personal} />
    ) : (
      <TaskCards rows={tasks} now={now} personal={personal} />
    );
  }

  const title = data ? `${data.label} (${String(data.total)})` : (open?.label ?? "");
  return (
    <Sheet
      open={open !== null}
      onClose={close}
      title={title}
      footer={footer}
      wide="4xl"
      bodyFocusable
    >
      {body}
    </Sheet>
  );
}
