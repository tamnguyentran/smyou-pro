import { Gift, Users } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useMe } from "../../me/api";
import { CustomerSearchField } from "../../revenueReport/components/CustomerSearchField";
import { useGifts, type CustomerGift } from "../api";
import { GiftFormSheet } from "../components/GiftFormSheet";
import { GiftList } from "../components/GiftList";

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách quà tặng"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** Ghi nhận quà tặng KH (M16-01b): màn hình riêng trong menu "Đơn hàng" — bắt buộc chọn khách
 * hàng trước khi xem danh sách, khớp API M16-01a (`customer_id` bắt buộc ở `GET /customer-gifts`).
 * Nút "Thêm quà tặng" luôn bật: sheet có ô chọn khách hàng riêng, không phụ thuộc ô tìm kiếm trên
 * trang (quyết định 2026-10-24). */
export function CustomerGiftsPage() {
  usePageTitle("Ghi nhận quà tặng KH");
  const me = useMe();
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [selected, setSelected] = useState<CustomerGift | "new" | null>(null);

  const gifts = useGifts(customerId || undefined);

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
  if (!("customer_gift.read" in capabilities)) return <ForbiddenPage />;
  const canManage = "customer_gift.manage" in capabilities;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1">
          <CustomerSearchField
            customerId={customerId}
            customerName={customerName}
            onSelect={(customer) => {
              setCustomerId(customer.id);
              setCustomerName(customer.name);
            }}
            placeholder="Tìm khách hàng…"
          />
        </div>
        {canManage ? (
          <Button
            icon={<Gift aria-hidden="true" className="size-4" />}
            onClick={() => {
              setSelected("new");
            }}
          >
            Thêm quà tặng
          </Button>
        ) : null}
      </div>

      {customerId === "" ? (
        <EmptyState icon={Users} message="Chọn khách hàng để xem danh sách quà tặng." />
      ) : gifts.isPending ? (
        <Waiting />
      ) : gifts.isError ? (
        <EmptyState
          icon={Gift}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void gifts.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : gifts.data.items.length === 0 ? (
        <EmptyState icon={Gift} message="Chưa có bản ghi quà tặng." />
      ) : (
        <GiftList items={gifts.data.items} onSelect={canManage ? setSelected : undefined} />
      )}

      {selected ? (
        <GiftFormSheet
          key={selected === "new" ? "new" : selected.id}
          onClose={() => {
            setSelected(null);
          }}
          customerId={customerId}
          customerName={customerName}
          gift={selected === "new" ? undefined : selected}
          onCustomerSaved={(customer) => {
            setCustomerId(customer.id);
            setCustomerName(customer.name);
          }}
        />
      ) : null}
    </div>
  );
}
