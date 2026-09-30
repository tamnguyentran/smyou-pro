import { useParams } from "react-router";
import { MeError } from "../../../app/shell/MeError";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { useMe } from "../../me/api";
import { DraftOrderForm } from "../components/DraftOrderForm";

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải thông tin tài khoản"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** One route ("/orders/:id") serves both "/orders/new" (order.create, id === "new" means "not
 * created yet") and "/orders/{uuid}" (order.read) — see routes.tsx for why this isn't two routes. */
export function DraftOrderPage() {
  const { id } = useParams();
  const orderId = id === "new" ? undefined : id;
  const me = useMe();

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
  const required = orderId ? "order.read" : "order.create";
  if (!(required in me.data.capabilities)) return <ForbiddenPage />;

  return <DraftOrderForm orderId={orderId} />;
}
