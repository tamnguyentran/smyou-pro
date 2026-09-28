import { z } from "zod";
import type { components } from "../../lib/api/schema";

export type Category = components["schemas"]["ServiceCreate"]["category"];
export type Unit = components["schemas"]["ServiceCreate"]["unit"];

/** DOMAIN_MODEL §3 enum values, in display order. */
export const CATEGORY_LABELS: Record<Category, string> = {
  INSTALLATION: "Lắp đặt",
  REPAIR: "Sửa chữa",
  MAINTENANCE: "Bảo trì",
  REFILL: "Bơm mực",
  SOFTWARE: "Phần mềm",
  NETWORK_CABLING: "Đi dây mạng",
  OTHER: "Khác",
};
export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];

export const UNIT_LABELS: Record<Unit, string> = {
  CAI: "Cái",
  MAY: "Máy",
  BO: "Bộ",
  MET: "Mét",
  CUON: "Cuộn",
  HOP: "Hộp",
  LICENSE: "Giấy phép",
  LAN: "Lần",
  DIEM: "Điểm",
  GIO: "Giờ",
};
export const UNIT_ORDER = Object.keys(UNIT_LABELS) as Unit[];

// An empty string must fail as "required", not coerce to 0 (Number("") === 0) — blank the string to
// NaN before z.coerce.number() sees it, so its own invalid_type message fires instead.
const blankToNaN = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? NaN : value;

// §6: tiền VND là số nguyên (BIGINT) — chặn số thập phân ngay ở client, không đợi round-trip server.
const priceSchema = z
  .preprocess(blankToNaN, z.coerce.number("Vui lòng nhập giá."))
  .pipe(z.int("Giá phải là số nguyên.").min(0, "Giá phải lớn hơn hoặc bằng 0."));
// Vietnamese text matches the backend's own domain rule (catalog/domain.py vat_rate_problem).
const vatRateSchema = z
  .preprocess(blankToNaN, z.coerce.number("Vui lòng nhập VAT."))
  .pipe(z.number().min(0, "VAT phải trong khoảng 0-100.").max(100, "VAT phải trong khoảng 0-100."));
// Kept as a raw string (no transform) so the schema's input/output types match — converted to
// number|null by hand in ServiceFormSheet's submit handler, same as products does for `warranty_months`.
const defaultEstimatedHoursSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || (!Number.isNaN(Number(value)) && Number(value) >= 0),
    "Số giờ ước tính phải là số ≥ 0.",
  )
  .optional();

/** Client-side checks before the server's (AC-CAT-028/AC-CAT-022); `code`/`category`/`unit` are only
 * required on create — locked after that (AC-CAT-029, §4). */
export const serviceCreateSchema = z.object({
  code: z.string().trim().min(1, "Vui lòng nhập mã dịch vụ."),
  category: z.enum(CATEGORY_ORDER as [Category, ...Category[]], "Vui lòng chọn nhóm dịch vụ."),
  unit: z.enum(UNIT_ORDER as [Unit, ...Unit[]], "Vui lòng chọn đơn vị."),
  name: z.string().trim().min(1, "Vui lòng nhập tên dịch vụ."),
  price: priceSchema,
  vat_rate: vatRateSchema,
  price_fixed: z.boolean(),
  default_estimated_hours: defaultEstimatedHoursSchema,
  description: z.string().trim().optional(),
});
export type ServiceFormValues = z.infer<typeof serviceCreateSchema>;

/** Edit mode never renders/validates code/category/unit — they are fixed after creation. */
export const serviceEditSchema = serviceCreateSchema.partial({
  code: true,
  category: true,
  unit: true,
});
