import { KeyRound, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { roleLabels } from "../../../app/menu";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { formatDate } from "../../../lib/format";
import { useSignOut } from "../../auth/useSignOut";
import { GENDER_LABELS, MARITAL_STATUS_LABELS } from "../../employees/schemas";
import { useMe } from "../../me/api";
import { PushSubscriptionToggle } from "../../notifications/components/PushSubscriptionToggle";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold break-words text-heading">{value}</dd>
    </div>
  );
}

/** Own profile (Q30): details, voluntary password change, sign-out. Editing details is M1-04. */
export function ProfilePage() {
  usePageTitle("Cá nhân");
  const me = useMe();
  const { signOut, pending, failed } = useSignOut();
  // Follow-up review M1-03b: every real role has `profile.manage: self`, so this only trips a
  // misconfigured account — kept after the loading/error branches so sign-out still works then.
  if (me.data && !("profile.manage" in me.data.capabilities)) return <ForbiddenPage />;
  let details: ReactNode;
  if (me.data) {
    const { employee, roles } = me.data;
    details = (
      <dl className="divide-y divide-line">
        <Row label="Họ và tên" value={employee.full_name} />
        <Row label="Mã nhân viên" value={employee.code} />
        <Row label="Vai trò" value={roleLabels(roles)} />
        <Row
          label="Ngày sinh"
          value={employee.birth_date ? formatDate(employee.birth_date) : "—"}
        />
        <Row label="Nơi sinh" value={employee.birth_place ?? "—"} />
        <Row
          label="Giới tính"
          value={employee.gender ? (GENDER_LABELS[employee.gender] ?? "—") : "—"}
        />
        <Row label="SĐT" value={employee.phone ?? "—"} />
        <Row label="Địa chỉ" value={employee.address ?? "—"} />
        <Row label="Email" value={employee.email ?? "—"} />
        <Row label="CMND/CCCD" value={employee.id_number ?? "—"} />
        <Row
          label="Ngày cấp"
          value={employee.id_issued_date ? formatDate(employee.id_issued_date) : "—"}
        />
        <Row label="Nơi cấp" value={employee.id_issued_place ?? "—"} />
        <Row
          label="Tình trạng hôn nhân"
          value={
            employee.marital_status ? (MARITAL_STATUS_LABELS[employee.marital_status] ?? "—") : "—"
          }
        />
      </dl>
    );
  } else if (me.isError) {
    details = (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  } else {
    details = <div aria-busy="true" className="h-48 animate-pulse rounded-xl bg-sidebar-sub" />;
  }
  // Sign-out does not depend on /me, so it stays available when /me cannot be loaded.
  return (
    <section className="space-y-4 rounded-2xl bg-card p-7 shadow-card md:max-w-md">
      {details}
      <Link
        to="/doi-mat-khau"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <KeyRound aria-hidden="true" className="size-4" />
        Đổi mật khẩu
      </Link>
      {me.data?.vapid_public_key ? (
        <PushSubscriptionToggle vapidPublicKey={me.data.vapid_public_key} />
      ) : null}
      {failed ? <Alert>Không đăng xuất được. Vui lòng thử lại.</Alert> : null}
      <Button
        variant="secondary"
        onClick={signOut}
        loading={pending}
        icon={<LogOut aria-hidden="true" className="size-4" />}
        className="w-full"
      >
        Đăng xuất
      </Button>
    </section>
  );
}
