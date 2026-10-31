import { FolderPlus, Tags } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useMe } from "../../me/api";
import {
  useProductServiceGroups,
  type ProductServiceGroup,
  type ProductServiceGroupFilters,
} from "../api";
import { ProductServiceGroupFormSheet } from "../components/ProductServiceGroupFormSheet";
import { ProductServiceGroupList } from "../components/ProductServiceGroupList";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách nhóm"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** M16-07: Manager quản lý "Nhóm sản phẩm/dịch vụ"; ai có `catalog.read` chỉ xem. */
export function ProductServiceGroupsPage() {
  usePageTitle("Nhóm sản phẩm/dịch vụ");
  const me = useMe();
  const [q, setQ] = useState("");
  const [isActive, setIsActive] = useState<ProductServiceGroupFilters["is_active"]>("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ProductServiceGroup | "new" | null>(null);
  const debouncedQ = useDebouncedValue(q, 300);

  const filters: ProductServiceGroupFilters = {
    q: debouncedQ,
    is_active: isActive,
    limit: PAGE_SIZE,
    offset,
  };
  const groups = useProductServiceGroups(filters);

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
  // M19-01a: TECHNICIAN has catalog.read only to pick items on site — these catalog screens stay
  // limited to the roles that held catalog.read before (= catalog.read_cost holders).
  if (!("catalog.read_cost" in capabilities)) return <ForbiddenPage />;
  const canManage = "catalog.manage" in capabilities;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Tìm kiếm"
            placeholder="Tên nhóm…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOffset(0);
            }}
          />
          <Select
            label="Trạng thái"
            value={isActive}
            onChange={(event) => {
              setIsActive(event.target.value as ProductServiceGroupFilters["is_active"]);
              setOffset(0);
            }}
          >
            <option value="">Tất cả</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Đã ngừng hoạt động</option>
          </Select>
        </div>
        {canManage ? (
          <Button
            icon={<FolderPlus aria-hidden="true" className="size-4" />}
            onClick={() => {
              setSelected("new");
            }}
          >
            Thêm nhóm
          </Button>
        ) : null}
      </div>

      {groups.isPending ? (
        <Waiting />
      ) : groups.isError ? (
        <EmptyState
          icon={Tags}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void groups.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : groups.data.items.length === 0 ? (
        <EmptyState icon={Tags} message="Chưa có nhóm phù hợp." />
      ) : (
        <>
          <ProductServiceGroupList items={groups.data.items} onSelect={setSelected} />
          <Pagination
            total={groups.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}

      {selected ? (
        <ProductServiceGroupFormSheet
          key={selected === "new" ? "new" : selected.id}
          onClose={() => {
            setSelected(null);
          }}
          group={selected === "new" ? undefined : selected}
          canManage={canManage}
        />
      ) : null}
    </div>
  );
}
