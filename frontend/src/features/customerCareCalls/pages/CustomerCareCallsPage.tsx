import { PhoneCall, Search } from "lucide-react";
import { useState } from "react";
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
 * `customer_care.call.record`. Ô "Người gọi" chỉ khi đọc được cuộc gọi của mọi người (phạm vi `all`,
 * AC-CUS-076) — CSKH phạm vi `own` chỉ thấy cuộc gọi mình ghi nên lọc theo người gọi vô nghĩa. */
export function CustomerCareCallsPage() {
  usePageTitle("Chăm sóc khách hàng");
  const me = useMe();
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [caller, setCaller] = useState({ id: "", name: "" });
  const [offset, setOffset] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const debouncedQ = useDebouncedValue(q, 300);

  const calls = useCareCalls(
    { q: debouncedQ, dateFrom, dateTo, callerId: caller.id, limit: PAGE_SIZE, offset },
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
  const readScopes = capabilities["customer_care.call.read"];
  if (!readScopes) return <ForbiddenPage />;
  const canRecord = "customer_care.call.record" in capabilities;
  const readsAll = readScopes.includes("all");

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
        {readsAll ? (
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
