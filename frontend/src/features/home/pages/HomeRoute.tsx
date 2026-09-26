import { useDocumentTitle } from "../../../lib/useDocumentTitle";
import { useSession } from "../../auth/api";
import { useSignOut } from "../../auth/useSignOut";
import { HomePage } from "./HomePage";

export function HomeRoute() {
  useDocumentTitle("Trang chủ");
  const { data: session } = useSession();
  const { signOut, pending, failed } = useSignOut();
  return (
    <HomePage
      employeeName={session?.employee.full_name}
      onLogout={signOut}
      loggingOut={pending}
      logoutFailed={failed}
    />
  );
}
