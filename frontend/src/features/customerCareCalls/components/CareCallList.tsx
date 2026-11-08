import { formatDateTime } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { CareCall } from "../api";

const HEADINGS = ["Thời gian", "Khách hàng", "SĐT", "Chào SP/DV", "Yêu cầu của KH", "Người gọi"];

/** AC-CUS-075: bảng trên desktop, thẻ trên mobile — cùng idiom OrderList; chỉ đọc (không sửa/xoá
 * cuộc gọi, spec §2). Yêu cầu trống hiện "—"; giờ theo Asia/Ho_Chi_Minh (`formatDateTime`). */
export function CareCallList({ items }: { items: CareCall[] }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {HEADINGS.map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="px-4 py-3 whitespace-nowrap text-body tabular-nums">
                {formatDateTime(item.called_at)}
              </td>
              <td className="px-4 py-3 font-medium text-heading">{item.customer_name}</td>
              <td className="px-4 py-3 whitespace-nowrap text-body">{item.customer_phone}</td>
              <td className="px-4 py-3 break-words whitespace-pre-line text-body">
                {item.offered}
              </td>
              <td className="px-4 py-3 break-words whitespace-pre-line text-body">
                {item.customer_request ?? "—"}
              </td>
              <td className="px-4 py-3 text-body">{item.caller_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="space-y-1 rounded-2xl bg-card p-5 shadow-card">
          <div className="flex w-full items-start justify-between gap-2">
            <p className="min-w-0 font-semibold break-words text-heading">{item.customer_name}</p>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {formatDateTime(item.called_at)}
            </span>
          </div>
          <p className="text-sm text-muted">{item.customer_phone}</p>
          <p className="text-sm break-words whitespace-pre-line text-body">
            <span className="text-muted">Chào SP/DV: </span>
            {item.offered}
          </p>
          <p className="text-sm break-words whitespace-pre-line text-body">
            <span className="text-muted">Yêu cầu của KH: </span>
            {item.customer_request ?? "—"}
          </p>
          <p className="text-xs text-muted">Người gọi: {item.caller_name}</p>
        </li>
      ))}
    </ul>
  );
}
