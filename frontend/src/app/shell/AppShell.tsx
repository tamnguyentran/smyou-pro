import { LogOut, Menu as MenuIcon, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Outlet } from "react-router";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { useSession } from "../../features/auth/api";
import { useSignOut } from "../../features/auth/useSignOut";
import { useMe } from "../../features/me/api";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { primaryAction, roleLabels, visibleMenu } from "../menu";
import { MeError } from "./MeError";
import { NavMenu } from "./NavMenu";
import { PageTitleContext } from "./pageTitle";

const DESKTOP = "(min-width: 1024px)";

function Brand({ roles }: { roles: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-accent"
      >
        S
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold text-heading">SMYou Pro</p>
        <p className="truncate text-xs font-medium text-muted">{roles}</p>
      </div>
    </div>
  );
}

function MenuBody({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  if (me.isPending) {
    return (
      <div role="group" aria-busy="true" aria-label="Đang tải menu" className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-xl bg-sidebar-sub" />
        ))}
      </div>
    );
  }
  if (me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  return (
    <NavMenu
      items={visibleMenu(me.data.capabilities)}
      counters={me.data.counters}
      onNavigate={onNavigate}
    />
  );
}

/** Menu panel shared by the desktop sidebar and the phone drawer. Identity comes from the session,
 * so signing out works even when /me cannot be loaded. */
function Panel({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session } = useSession();
  const { signOut, pending, failed } = useSignOut();
  const name = session?.employee.full_name ?? "";
  const roles = roleLabels(session?.employee.roles ?? []);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        <Brand roles={roles} />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <MenuBody onNavigate={onNavigate} />
      </div>
      <div className="space-y-3 border-t border-line p-4">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-light text-sm font-semibold text-brand"
          >
            {name.split(" ").at(-1)?.charAt(0) ?? ""}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-heading">{name}</p>
            <p className="truncate text-xs font-medium text-muted">{roles}</p>
          </div>
        </div>
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
      </div>
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Phone/tablet slide-out menu: modal dialog, closes on item, overlay or Esc; Tab stays inside. */
function Drawer({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items.at(0);
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-40">
      <div
        data-testid="drawer-overlay"
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-heading/40"
      />
      <div
        ref={panel}
        className="absolute inset-y-0 left-0 w-80 max-w-[85vw] animate-[drawer-in_300ms_ease-in-out] bg-card shadow-card-hover motion-reduce:animate-none"
      >
        <button
          type="button"
          aria-label="Đóng menu"
          onClick={onClose}
          className="absolute top-3 right-2 flex size-11 items-center justify-center rounded-xl text-muted hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        <Panel onNavigate={onClose} />
      </div>
    </div>
  );
}

function PrimaryAction() {
  const { data: session } = useSession();
  const action = primaryAction(session?.employee.roles ?? []);
  if (!action) return null;
  return (
    <Link
      to={action.path}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Plus aria-hidden="true" className="size-4 text-accent" />
      {action.label}
    </Link>
  );
}

function Content({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-8">{children}</main>;
}

/** Role-based app shell (UI_GUIDELINES §3–§4): sidebar ≥ 1024px, header + drawer below. */
export function AppShell() {
  const desktop = useMediaQuery(DESKTOP, true);
  const [title, setTitle] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);
  // Back to the menu button once the drawer is gone (the page is inert while it is open).
  useEffect(() => {
    if (wasOpen.current && !drawerOpen) menuButton.current?.focus();
    wasOpen.current = drawerOpen;
  }, [drawerOpen]);

  if (desktop) {
    return (
      <PageTitleContext value={setTitle}>
        <div className="flex h-dvh overflow-hidden bg-page">
          <aside className="w-72 shrink-0 border-r border-line bg-card">
            <Panel />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-card px-8">
              <h1 className="truncate text-2xl font-bold tracking-tight text-heading">{title}</h1>
              <PrimaryAction />
            </header>
            <Content>
              <Outlet />
            </Content>
          </div>
        </div>
      </PageTitleContext>
    );
  }
  return (
    <PageTitleContext value={setTitle}>
      <div className="flex min-h-dvh flex-col bg-page" inert={drawerOpen}>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-card px-2">
          <button
            ref={menuButton}
            type="button"
            aria-label="Mở menu"
            onClick={() => {
              setDrawerOpen(true);
            }}
            className="flex size-11 items-center justify-center rounded-xl text-heading hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <MenuIcon aria-hidden="true" className="size-6" />
          </button>
          <h1 className="truncate text-lg font-semibold text-heading">{title}</h1>
        </header>
        <Content>
          <Outlet />
        </Content>
      </div>
      {drawerOpen ? <Drawer onClose={closeDrawer} /> : null}
    </PageTitleContext>
  );
}
