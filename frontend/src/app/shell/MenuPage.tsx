import { useMe } from "../../features/me/api";
import { menuIcon, type MenuItem } from "../menu";
import { ComingSoonPage, ForbiddenPage } from "./StatusPage";

/** A menu destination: 403 without the capabilities (display only — the API checks them too),
 * otherwise the page (a placeholder until its feature is built, Q27). */
export function MenuPage({ item, capabilities }: { item: MenuItem; capabilities: string[] }) {
  const me = useMe();
  if (!me.data)
    return <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-sidebar-sub" />;
  const granted = me.data.capabilities;
  if (!capabilities.every((c) => c in granted)) return <ForbiddenPage />;
  return <ComingSoonPage title={item.label} icon={menuIcon(item.icon)} />;
}
