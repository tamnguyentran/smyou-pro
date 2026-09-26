import { useNavigate } from "react-router";
import { useLogout, useSession } from "../../auth/api";
import { HomePage } from "./HomePage";

export function HomeRoute() {
  const { data: session } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <HomePage
      employeeName={session?.employee.full_name}
      onLogout={() => {
        // Push (not replace) the sign-in page: "Back" then lands on a protected page and the guard
        // sends the user straight back to sign-in (AC-AUTH-026).
        logout.mutate(undefined, {
          onSettled: () => {
            void navigate("/dang-nhap");
          },
        });
      }}
      loggingOut={logout.isPending}
    />
  );
}
