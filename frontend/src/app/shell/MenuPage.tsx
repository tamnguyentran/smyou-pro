import { useMe } from "../../features/me/api";
import { menuIcon, type MenuItem } from "../menu";
import { MeError } from "./MeError";
import { usePageTitle } from "./pageTitle";
import { ComingSoonPage, ForbiddenPage } from "./StatusPage";

function Waiting({ title }: { title: string }) {
  usePageTitle(title);
  return <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-sidebar-sub" />;
}

function Failed({ title, onRetry }: { title: string; onRetry: () => void }) {
  usePageTitle(title);
  return <MeError onRetry={onRetry} />;
}

/** A menu destination: 403 without the capabilities (display only — the API checks them too),
 * otherwise the page (a placeholder until its feature is built, Q27). */
export function MenuPage({ item, capabilities }: { item: MenuItem; capabilities: string[] }) {
  const me = useMe();
  // Only a failed first load is an error: a failed background refetch keeps the cached data.
  if (!me.data && me.isError) {
    return (
      <Failed
        title={item.label}
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <Waiting title={item.label} />;
  const granted = me.data.capabilities;
  if (!capabilities.every((c) => c in granted)) return <ForbiddenPage />;
  return <ComingSoonPage title={item.label} icon={menuIcon(item.icon)} />;
}
