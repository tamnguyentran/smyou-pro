/** Logo + product name, shared by the sign-in pages and the home placeholder. */
export function BrandHeader() {
  return (
    <>
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
    </>
  );
}
