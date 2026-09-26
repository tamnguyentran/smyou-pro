import { useNavigate } from "react-router";
import { useLogout } from "./api";

/** Sign out, then push (not replace) the sign-in page: "Back" lands on a protected page and the
 * guard sends the user straight back to sign-in (AC-AUTH-026). */
export function useSignOut() {
  const logout = useLogout();
  const navigate = useNavigate();
  return {
    signOut: () => {
      logout.mutate(undefined, {
        onSuccess: () => {
          void navigate("/dang-nhap");
        },
      });
    },
    pending: logout.isPending,
    failed: logout.isError,
  };
}
