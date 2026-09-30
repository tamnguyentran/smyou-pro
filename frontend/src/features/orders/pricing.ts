/** Mirrors backend/app/modules/orders/domain.py's price_line — optimistic client-side preview only
 * (AC-ORD-027/028): the server's response, once a mutation lands, is always what gets persisted/shown. */
export interface LineTotals {
  line_gross: number;
  line_discount: number;
  line_vat: number;
  line_total: number;
}

// Quantities/prices in this domain are never negative, so Math.round (rounds .5 up) matches Python's
// ROUND_HALF_UP for every value this function actually sees.
function roundHalfUp(value: number): number {
  return Math.round(value);
}

export function computeLineTotal(input: {
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  vatRate: number;
  isGift: boolean;
}): LineTotals {
  const unitPrice = input.isGift ? 0 : input.unitPrice;
  const lineGross = roundHalfUp(input.quantity * unitPrice);
  const lineDiscount = Math.min(input.lineDiscount, lineGross);
  const lineVat = roundHalfUp(((lineGross - lineDiscount) * input.vatRate) / 100);
  const lineTotal = lineGross - lineDiscount + lineVat;
  return {
    line_gross: lineGross,
    line_discount: lineDiscount,
    line_vat: lineVat,
    line_total: lineTotal,
  };
}
