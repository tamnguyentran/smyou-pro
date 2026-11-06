import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { Badge } from "../../../components/ui/Badge";
import { cn } from "../../../lib/cn";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { useMe } from "../../me/api";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_ORDER,
  ORDER_STATUS_TONE,
} from "../../orders/orderStatus";
import { guidesFor, ORDER_STATUS_HELP, type Guide } from "../content";

const DESKTOP = "(min-width: 1024px)";
const STATUS_ID = "trang-thai-don";
const FAQ_ID = "cau-hoi-thuong-gap";

/** AC-HELP-002…006 (M26-01): `/huong-dan` — bản hướng dẫn của các vai trò người dùng có (Quản lý
 * chung xem cả 5). Chỉ chọn nội dung đọc, không cấp quyền gì. */
export function GuidePage() {
  usePageTitle("Hướng dẫn sử dụng");
  const me = useMe();
  const [params, setParams] = useSearchParams();

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <div className="h-64 animate-pulse rounded-2xl bg-card shadow-card" />;

  const guides = guidesFor(me.data.roles);
  const current = guides.find((g) => g.role === params.get("vai-tro")) ?? guides[0];
  if (!current) {
    return <p className="text-sm text-muted">Tài khoản của bạn chưa được gán vai trò nào.</p>;
  }

  return (
    <div className="min-w-0 space-y-6">
      {guides.length > 1 ? (
        <div role="tablist" aria-label="Vai trò" className="flex gap-2 overflow-x-auto pb-1">
          {guides.map((g) => (
            <button
              key={g.role}
              type="button"
              role="tab"
              aria-selected={g.role === current.role}
              onClick={() => {
                setParams({ "vai-tro": g.role });
              }}
              className={cn(
                "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                g.role === current.role
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-card text-body hover:bg-sidebar-sub",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      ) : null}
      <GuideArticle key={current.role} guide={current} />
    </div>
  );
}

function GuideArticle({ guide }: { guide: Guide }) {
  const desktop = useMediaQuery(DESKTOP, true);
  const entries = [
    ...guide.sections.map((s) => ({ id: s.id, title: s.title })),
    { id: STATUS_ID, title: "Trạng thái đơn hàng" },
    { id: FAQ_ID, title: "Câu hỏi thường gặp" },
  ];
  const toc = (
    <nav aria-label="Mục lục">
      <ol className="space-y-1">
        {entries.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-body hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {e.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );

  return (
    <section
      aria-label={`Hướng dẫn ${guide.label}`}
      className="min-w-0 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8"
    >
      {desktop ? (
        <div className="sticky top-20 self-start rounded-2xl bg-card p-3 shadow-card">{toc}</div>
      ) : null}
      <div className="min-w-0 space-y-4">
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <p className="text-sm font-semibold text-muted">Bạn làm gì trong hệ thống</p>
          <p className="mt-1 text-base text-body">{guide.summary}</p>
        </div>
        {desktop ? null : (
          <details className="rounded-2xl bg-card p-2 shadow-card">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-heading">
              Mục lục
            </summary>
            {toc}
          </details>
        )}
        {guide.sections.map((s) => (
          <Block key={s.id} id={s.id} title={s.title}>
            {s.body ? <p className="text-sm text-body">{s.body}</p> : null}
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-body">
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {s.note ? (
              <p className="rounded-xl border border-line bg-sidebar-sub p-3 text-sm text-body">
                <span className="font-semibold text-heading">Lưu ý: </span>
                {s.note}
              </p>
            ) : null}
          </Block>
        ))}
        <Block id={STATUS_ID} title="Trạng thái đơn hàng">
          <dl className="space-y-3 text-sm">
            {ORDER_STATUS_ORDER.map((status) => (
              <div key={status} className="space-y-1">
                <dt>
                  <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
                </dt>
                <dd className="text-body">{ORDER_STATUS_HELP[status]}</dd>
              </div>
            ))}
          </dl>
        </Block>
        <Block id={FAQ_ID} title="Câu hỏi thường gặp">
          <dl className="space-y-3 text-sm">
            {guide.faq.map((f) => (
              <div key={f.question}>
                <dt className="font-semibold text-heading">{f.question}</dt>
                <dd className="mt-0.5 text-body">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </Block>
      </div>
    </section>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-20 space-y-3 rounded-2xl bg-card p-5 shadow-card"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold text-heading">
        {title}
      </h2>
      {children}
    </section>
  );
}
