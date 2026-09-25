import { Wrench } from "lucide-react";

/** Placeholder landing page (M0-02); replaced by the role dashboard in M7-02. */
export function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full rounded-2xl border border-line bg-card p-6 shadow-card md:max-w-md md:p-8">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand text-xl font-bold text-accent"
          >
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-heading lg:text-3xl">SMYou Pro</h1>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-body">
          Quản lý đơn hàng và đầu việc kỹ thuật
        </p>
        <p className="mt-6 flex items-center gap-2 text-xs font-medium text-muted">
          <Wrench aria-hidden="true" className="size-4 text-accent" />
          Công ty TNHH SMYou
        </p>
      </section>
    </main>
  );
}
