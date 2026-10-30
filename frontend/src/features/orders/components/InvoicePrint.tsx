import { formatDate } from "../../../lib/format";
import { UNIT_LABELS } from "../../services/schemas";
import type { InvoicePrintData, Order } from "../api";
import { vndToWords } from "../vndWords";

const NUMBER = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 });
const UNITS: Partial<Record<string, string>> = UNIT_LABELS;
const PERCENT = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
// Auto table layout: every column except "Tên hàng" is `w-px`, i.e. exactly as wide as its widest value
// (body cells never wrap, so a product code stays on one line; long headers may wrap); "Tên hàng" takes
// what is left and wraps. Nothing is pushed past the paper edge. `ref` = the numbering row under the
// headers (chủ dự án, 2026-10-29). Cells 9/8/10/11 are the line's stored `line_gross`/`line_discount`/
// `line_vat`/`line_total` (domain.price_line computes VAT on gross − discount), so the formulas hold.
const FIT = "w-px";
const COLUMNS: { label: string; ref: string; className: string }[] = [
  { label: "Stt", ref: "1", className: FIT },
  { label: "Mã hàng", ref: "2", className: FIT },
  { label: "Tên hàng", ref: "3", className: "" },
  { label: "ĐVT", ref: "4", className: FIT },
  { label: "SL", ref: "5", className: FIT },
  { label: "Đơn giá", ref: "6", className: FIT },
  { label: "VAT (%)", ref: "7", className: FIT },
  { label: "Chiết khấu", ref: "8", className: FIT },
  { label: "Thành tiền (Chưa VAT)", ref: "9=5x6", className: FIT },
  { label: "Tiền VAT", ref: "10=7x(9-8)", className: FIT },
  { label: "Thành tiền có VAT", ref: "11=9-8+10", className: FIT },
];
const CELL = "border border-black px-1";
const NUM = `${CELL} text-right whitespace-nowrap`;

function money(amount: number): string {
  return NUMBER.format(amount);
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p className="flex gap-1">
      <span className="shrink-0">{label}:</span>
      <span className="font-semibold">{value ?? ""}</span>
    </p>
  );
}

function TotalRow({
  label,
  amount,
  strong = false,
}: {
  label: string;
  amount: number;
  strong?: boolean;
}) {
  return (
    <p className={strong ? "flex justify-between gap-4 font-bold" : "flex justify-between gap-4"}>
      <span>{label}</span>
      <span>{money(amount)}</span>
    </p>
  );
}

/** "Hoá đơn bán hàng" A5 ngang theo mẫu giấy công ty (M17-04 §6). Dòng hàng/tổng lấy từ `order`
 * (GET /orders/{id}); `data` chỉ mang phần riêng của bản in. Chỉ hiện khi in — xem `.invoice-print`
 * trong styles/index.css. */
export function InvoicePrint({ order, data }: { order: Order; data: InvoicePrintData }) {
  const { company } = data;
  const printedOn = formatDate(data.printed_at);
  const [day = "", month = "", year = ""] = printedOn.split("/");
  const lines = [...order.lines].sort((a, b) => a.position - b.position);
  const contacts = [
    `ĐT: ${company.phone}`,
    company.fax ? `Fax: ${company.fax}` : null,
    company.email ? `Email: ${company.email}` : null,
    company.website ? `Website: ${company.website}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <div
      data-testid="invoice-print"
      className="invoice-print bg-white text-[8pt] leading-snug text-black"
      style={{ fontFamily: "system-ui, Arial, sans-serif" }}
    >
      <header className="flex items-start gap-3 border-b border-black pb-2">
        {company.logo_url ? (
          <img
            src={company.logo_url}
            alt="Logo công ty"
            className="h-14 w-auto shrink-0 object-contain"
          />
        ) : null}
        <div className="min-w-0 space-y-0.5">
          <p className="text-[10pt] font-bold uppercase">{company.name}</p>
          <p>Địa chỉ: {company.address}</p>
          <p>{contacts.join(" - ")}</p>
        </div>
      </header>

      <h1 className="my-3 text-center text-[13pt] font-bold">HÓA ĐƠN BÁN HÀNG</h1>

      <section className="grid grid-cols-[1fr_auto] gap-x-4">
        <div className="min-w-0 space-y-0.5">
          <Field label="Tên khách hàng" value={order.customer_name} />
          <Field label="Địa chỉ" value={order.service_address} />
          <Field label="Mã số thuế" value={order.customer_tax_code} />
          <Field label="Điện thoại" value={order.customer_phone} />
          <Field label="Email" value={order.customer_email} />
          <Field label="Diễn giải" value={order.work_description} />
        </div>
        <div className="space-y-0.5">
          <Field label="Ngày xuất" value={printedOn} />
          <Field label="Số phiếu" value={data.slip_no} />
          <Field label="Loại tiền" value="VND" />
        </div>
      </section>

      {/* 2px narrower than the sheet: with collapsed borders half of the outer border lies outside the
          table box, and at exactly 100% the page edge clipped the right border on paper. */}
      <table className="mx-px mt-3 w-[calc(100%-2px)] border-collapse text-[8pt]">
        <thead className="table-header-group">
          <tr>
            {COLUMNS.map(({ label, className }) => (
              <th key={label} scope="col" className={`${CELL} py-0.5 font-semibold ${className}`}>
                {label}
              </th>
            ))}
          </tr>
          <tr>
            {COLUMNS.map(({ label, ref }) => (
              <td key={label} className={`${CELL} text-center whitespace-nowrap italic`}>
                {ref}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id} className="break-inside-avoid align-top">
              <td className={`${CELL} text-center`}>{index + 1}</td>
              <td className={`${CELL} whitespace-nowrap`}>{line.sku_snapshot ?? ""}</td>
              <td className={`${CELL} [overflow-wrap:anywhere]`}>{line.name_snapshot}</td>
              <td className={`${CELL} text-center whitespace-nowrap`}>
                {UNITS[line.unit_snapshot] ?? line.unit_snapshot}
              </td>
              <td className={NUM}>{NUMBER.format(Number(line.quantity))}</td>
              <td className={NUM}>{money(line.unit_price)}</td>
              <td className={NUM}>{PERCENT.format(Number(line.vat_rate))}</td>
              <td className={NUM}>{money(line.line_discount)}</td>
              <td className={NUM}>{money(line.line_gross)}</td>
              <td className={NUM}>{money(line.line_vat)}</td>
              <td className={NUM}>{money(line.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div data-testid="invoice-totals" className="ml-auto mt-2 w-1/2 space-y-0.5">
        {/* Chủ dự án 2026-10-29: always these 4 lines = column sums 9, 8, 10, 11 of the table
            (chưa VAT − chiết khấu + VAT = thanh toán). */}
        <TotalRow label="Tổng tiền chưa có VAT:" amount={order.subtotal} />
        <TotalRow label="Tổng chiết khấu:" amount={order.discount_amount} />
        <TotalRow label="Tổng tiền VAT:" amount={order.vat_amount} />
        <TotalRow label="Tổng tiền thanh toán đã có VAT:" amount={order.total} strong />
      </div>
      <p className="mt-2">
        Số tiền bằng chữ: <span className="font-semibold italic">{vndToWords(order.total)}</span>
      </p>

      <footer className="mt-3 grid break-inside-avoid grid-cols-2 text-center">
        <div>
          {/* Same height as the date line on the right, so both signature titles sit on one row. */}
          <p aria-hidden="true">&nbsp;</p>
          <p className="font-bold">Người nhận</p>
          <p className="italic">(Ký, ghi rõ họ tên)</p>
        </div>
        <div>
          <p className="italic">{`Ngày ${day} tháng ${month} năm ${year}`}</p>
          <p className="font-bold">Người lập</p>
          <p className="italic">(Ký, ghi rõ họ tên)</p>
          <p className="mt-14 font-semibold">{data.issuer_name}</p>
        </div>
      </footer>
    </div>
  );
}
