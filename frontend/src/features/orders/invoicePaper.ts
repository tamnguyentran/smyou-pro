/** CSS px per mm (96 px = 1 in = 25.4 mm). */
export const MM = 96 / 25.4;

/** A5 landscape page height (148 mm) less 3 mm of slack for screen vs print font rendering. */
const A5_LANDSCAPE_FIT_MM = 148 - 3;

/** UAT-04 (AC-ORD-277): the sheet's height laid out at the 194 mm printable width — the same for
 * A5 landscape and A4 portrait (210 mm − 2 × 8 mm side margins) — picks the paper. */
export function invoicePaper(heightPx: number): "A5" | "A4" {
  return heightPx <= A5_LANDSCAPE_FIT_MM * MM ? "A5" : "A4";
}
