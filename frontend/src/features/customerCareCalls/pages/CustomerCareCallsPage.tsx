import { PhoneCall, Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { DateField } from "../../../components/ui/DateField";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { TextField } from "../../../components/ui/TextField";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { EmployeeSearchField } from "../../employees/components/EmployeeSearchField";
import { useMe } from "../../me/api";
import { useCareCalls } from "../api";
import { CareCallFormSheet } from "../components/CareCallFormSheet";
import { CareCallList } from "../components/CareCallList";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách cuộc gọi"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** M27-01b: "Đơn hàng › Chăm sóc KH" — vào trang cần `customer_care.call.read`; nút ghi cuộc gọi cần
 * `customer_care.call.record`.
 * AC-CUS-081..084 (M27-03, Q197): "Chỉ cuộc gọi của tôi" — `?mine=1`/`?mine=0` thắng; không có thì
 * mặc định bật cho CSKH không kiêm Quản lý (giống "Chỉ đơn của tôi"). Bật → lọc `caller_id` = mình và
 * ẩn ô "Người gọi"; danh sách chỉ tải khi `me` có dữ liệu để request đầu tiên đã đúng `caller_id`. */
export function CustomerCareCallsPage() {
  usePageTitle("Chăm sóc khách hàng");
  const me = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const mineParam = searchParams.get("mine");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [caller, setCaller] = useState({ id: "", name: "" });
  const [offset, setOffset] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const debouncedQ = useDebouncedValue(q, 300);

  const roles = me.data?.roles ?? [];
  const mine =
    mineParam === "1" ||
    (mineParam !== "0" && roles.includes("CUSTOMER_CARE") && !roles.includes("MANAGER"));
  const callerId = mine ? (me.data?.employee.id ?? "") : caller.id;

  const calls = useCareCalls(
    { q: debouncedQ, dateFrom, dateTo, callerId, limit: PAGE_SIZE, offset },
    me.data !== undefined && "customer_care.call.read" in me.data.capabilities,
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
  if (!me.data) return <Waiting />;
  const capabilities = me.data.capabilities;
  if (!("customer_care.call.read" in capabilities)) return <ForbiddenPage />;
  const canRecord = "customer_care.call.record" in capabilities;

  return (
    <div className="space-y-4">
      {canRecord ? (
        <div className="flex justify-end">
          <Button
            icon={<PhoneCall aria-hidden="true" className="size-4" />}
            onClick={() => {
              setSheetOpen(true);
            }}
          >
            Ghi nhận cuộc gọi
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <TextField
            label="Tìm khách hàng"
            placeholder="Tên, số điện thoại…"
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
        <DateField
          mode="date"
          label="Từ ngày"
          value={dateFrom}
          onChange={(value) => {
            setDateFrom(value);
            setOffset(0);
          }}
        />
        <DateField
          mode="date"
          label="Đến ngày"
          value={dateTo}
          onChange={(value) => {
            setDateTo(value);
            setOffset(0);
          }}
        />
        {!mine ? (
          <div className="col-span-2 lg:col-span-1">
            <EmployeeSearchField
              label="Người gọi"
              employeeId={caller.id}
              employeeName={caller.name}
              onSelect={(employee) => {
                setCaller(employee);
                setOffset(0);
              }}
            />
          </div>
        ) : null}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => {
              const next = event.target.checked;
              setSearchParams(
                (params) => {
                  params.set("mine", next ? "1" : "0");
                  return params;
                },
                { replace: true },
              );
              setCaller({ id: "", name: "" });
              setOffset(0);
            }}
            className="size-5 shrink-0 rounded border-line accent-[color:var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
          Chỉ cuộc gọi của tôi
        </label>
      </div>

      {calls.isPending ? (
        <Waiting />
      ) : calls.isError ? (
        <EmptyState
          icon={PhoneCall}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void calls.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : calls.data.items.length === 0 ? (
        <EmptyState icon={PhoneCall} message="Chưa có cuộc gọi nào." />
      ) : (
        <>
          <CareCallList items={calls.data.items} />
          <Pagination
            total={calls.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}

      {sheetOpen ? (
        <CareCallFormSheet
          onClose={() => {
            setSheetOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
