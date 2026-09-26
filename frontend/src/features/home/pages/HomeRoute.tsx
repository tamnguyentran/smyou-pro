import { usePageTitle } from "../../../app/shell/pageTitle";
import { useSession } from "../../auth/api";
import { HomePage } from "./HomePage";

export function HomeRoute() {
  usePageTitle("Tổng quan");
  const { data: session } = useSession();
  return <HomePage employeeName={session?.employee.full_name} />;
}
