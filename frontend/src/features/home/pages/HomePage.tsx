import { Building2 } from "lucide-react";
import { BrandHeader } from "../../../components/BrandHeader";

/** Placeholder dashboard inside the app shell; replaced by the role dashboards in M7-02. */
export function HomePage({ employeeName }: { employeeName?: string }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6 shadow-card md:max-w-md md:p-8">
      <BrandHeader />
      {employeeName ? (
        <p className="mt-4 text-base font-semibold text-heading">Xin chào, {employeeName}</p>
      ) : null}
      <p className="mt-6 flex items-center gap-2 text-xs font-medium text-muted">
        <Building2 aria-hidden="true" className="size-4 text-accent" />
        Công ty TNHH SMYou
      </p>
    </section>
  );
}
