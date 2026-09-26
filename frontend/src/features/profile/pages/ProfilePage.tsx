import { KeyRound, LogOut } from "lucide-react";
import { Link } from "react-router";
import { roleLabels } from "../../../app/menu";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { useSignOut } from "../../auth/useSignOut";
import { useMe } from "../../me/api";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold break-all text-heading">{value}</dd>
    </div>
  );
}

/** Own profile (Q30): details, voluntary password change, sign-out. Editing details is M1-04. */
export function ProfilePage() {
  usePageTitle("Cá nhân");
  const me = useMe();
  const { signOut, pending, failed } = useSignOut();
  if (!me.data)
    return <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-sidebar-sub" />;
  const { employee, roles } = me.data;
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-6 shadow-card md:max-w-md">
      <dl className="divide-y divide-line">
        <Row label="Họ và tên" value={employee.full_name} />
        <Row label="Mã nhân viên" value={employee.code} />
        <Row label="Email" value={employee.email} />
        <Row label="Vai trò" value={roleLabels(roles)} />
      </dl>
      <Link
        to="/doi-mat-khau"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <KeyRound aria-hidden="true" className="size-4" />
        Đổi mật khẩu
      </Link>
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
