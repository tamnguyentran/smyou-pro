import { LogOut, Wrench } from "lucide-react";
import { BrandHeader } from "../../../components/BrandHeader";
import { Button } from "../../../components/ui/Button";

interface HomePageProps {
  employeeName?: string;
  onLogout?: () => void;
  loggingOut?: boolean;
}

/** Placeholder landing page (M0-02); replaced by the role dashboard in M7-02.
 * The sign-out button lives here until the AppShell exists (M1-03). */
export function HomePage({ employeeName, onLogout, loggingOut = false }: HomePageProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full rounded-2xl border border-line bg-card p-6 shadow-card md:max-w-md md:p-8">
        <BrandHeader />
        {employeeName ? (
          <p className="mt-4 text-base font-semibold text-heading">Xin chào, {employeeName}</p>
        ) : null}
        <p className="mt-6 flex items-center gap-2 text-xs font-medium text-muted">
          <Wrench aria-hidden="true" className="size-4 text-accent" />
          Công ty TNHH SMYou
        </p>
        {onLogout ? (
          <Button
            variant="secondary"
            onClick={onLogout}
            loading={loggingOut}
            icon={<LogOut aria-hidden="true" className="size-4" />}
            className="mt-6 w-full"
          >
            Đăng xuất
          </Button>
        ) : null}
      </section>
    </main>
  );
}
