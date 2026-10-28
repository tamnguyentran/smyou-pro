import { Search, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { ChipGroup } from "../../../components/ui/Chip";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { TextField } from "../../../components/ui/TextField";
import { defaultMonthToDateRange } from "../../../lib/dateRange";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useMe } from "../../me/api";
import { useCsatSummary, useOrders, type OrderFilters } from "../api";
import { CsatSummaryStats } from "../components/CsatSummaryStats";
import { OrderList } from "../components/OrderList";
import { ORDER_STATUS_LABEL, ORDER_STATUS_ORDER } from "../orderStatus";

const PAGE_SIZE = 20;
const OVERDUE_CHIP_VALUE = "OVERDUE";

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách đơn"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** AC-ORD-069: trang `/orders` — capability hiệu lực để vào trang là `order.read` (spec §6, Q56).
 * AC-DASH-022/023/026 (M10-03): đọc `status`/`mine` từ URL 1 lần lúc tải để khớp đúng drill-down
 * từ Tổng quan — không đồng bộ URL ngược lại sau đó (ngoài phạm vi spec §2).
 * AC-CSK-010/012 (M15-02b): CUSTOMER_CARE mặc định bộ lọc ngày = đầu tháng hiện tại → hôm nay —
 * tính thẳng từ vai trò mỗi lần render (không lưu vào state) để không phụ thuộc thời điểm `me`
 * tải xong; `dateFrom`/`dateTo`/`csatRating` chỉ vào state khi người dùng tự đổi. */
export function OrdersListPage() {
  usePageTitle("Danh sách đơn");
  const me = useMe();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [mine, setMine] = useState(() => searchParams.get("mine") === "1");
  const [overdue, setOverdue] = useState(() => searchParams.get("overdue") === "1");
  const [dateFrom, setDateFrom] = useState<string | undefined>(
    () => searchParams.get("from") ?? undefined,
  );
  const [dateTo, setDateTo] = useState<string | undefined>(
    () => searchParams.get("to") ?? undefined,
  );
  const [csatRating, setCsatRating] = useState<number | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const debouncedQ = useDebouncedValue(q, 300);

  const isCustomerCare = me.data?.roles.includes("CUSTOMER_CARE") ?? false;
  const csCareDefault = isCustomerCare ? defaultMonthToDateRange() : undefined;
  const effectiveDateFrom = dateFrom ?? csCareDefault?.from;
  const effectiveDateTo = dateTo ?? csCareDefault?.to;

  const filters: OrderFilters = {
    q: debouncedQ,
    status,
    mine,
    overdue,
    dateFrom: effectiveDateFrom,
    dateTo: effectiveDateTo,
    csatRating,
    limit: PAGE_SIZE,
    offset,
  };
  const orders = useOrders(filters);
  const csatSummary = useCsatSummary({ dateFrom: effectiveDateFrom, dateTo: effectiveDateTo });

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
  if (!("order.read" in me.data.capabilities)) return <ForbiddenPage />;

  return (
    <div className="space-y-4">
      {isCustomerCare ? (
        <CsatSummaryStats
          summary={csatSummary.data ?? {}}
          selected={csatRating}
          onSelect={(rating) => {
            setCsatRating(rating);
            setOffset(0);
          }}
        />
      ) : null}

      {/* Laptop (lg:): tìm kiếm + từ ngày + đến ngày cùng 1 dòng (4 cột, tìm kiếm chiếm 2).
          Tablet/mobile: tìm kiếm riêng 1 dòng (col-span-2 trên lưới 2 cột), từ ngày + đến ngày
          cùng 1 dòng tiếp theo. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2">
          <TextField
            label="Tìm kiếm"
            placeholder="Mã đơn, tên khách, số điện thoại…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOffset(0);
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
        </div>
        {isCustomerCare ? (
          <>
            <TextField
              type="date"
              label="Từ ngày"
              value={effectiveDateFrom ?? ""}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setOffset(0);
              }}
            />
            <TextField
              type="date"
              label="Đến ngày"
              value={effectiveDateTo ?? ""}
              onChange={(event) => {
                setDateTo(event.target.value);
                setOffset(0);
              }}
            />
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ChipGroup
          label="Trạng thái"
          value={overdue ? OVERDUE_CHIP_VALUE : status}
          options={[
            { value: "", label: "Tất cả" },
            ...ORDER_STATUS_ORDER.map((value) => ({ value, label: ORDER_STATUS_LABEL[value] })),
            { value: OVERDUE_CHIP_VALUE, label: "Quá hạn" },
          ]}
          onChange={(value) => {
            if (value === OVERDUE_CHIP_VALUE) {
              setOverdue(true);
              setStatus("");
            } else {
              setOverdue(false);
              setStatus(value);
            }
            setOffset(0);
          }}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => {
              setMine(event.target.checked);
              setOffset(0);
            }}
            className="size-5 shrink-0 rounded border-line accent-[color:var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
          Chỉ đơn của tôi
        </label>
      </div>

      {orders.isPending ? (
        <Waiting />
      ) : orders.isError ? (
        <EmptyState
          icon={ShoppingBag}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void orders.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : orders.data.items.length === 0 ? (
        <EmptyState icon={ShoppingBag} message="Không tìm thấy đơn nào." />
      ) : (
        <>
          <OrderList items={orders.data.items} />
          <Pagination
            total={orders.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}
    </div>
  );
}
