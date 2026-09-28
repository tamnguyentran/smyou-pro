import { z } from "zod";
import type { components } from "../../lib/api/schema";

export type Category = components["schemas"]["ProductCreate"]["category"];
export type Unit = components["schemas"]["ProductCreate"]["unit"];

/** DOMAIN_MODEL §2 enum values, in display order. */
export const CATEGORY_LABELS: Record<Category, string> = {
  PC: "Máy tính để bàn",
  LAPTOP: "Laptop",
  MONITOR: "Màn hình",
  PRINTER: "Máy in",
  SCANNER: "Máy scan",
  PRINTER_SUPPLY: "Mực in",
  CAMERA: "Camera",
  RECORDER: "Đầu ghi",
  STORAGE: "Lưu trữ",
  NETWORK: "Thiết bị mạng",
  ACCESSORY: "Phụ kiện",
  MATERIAL: "Vật tư",
  SOFTWARE: "Phần mềm",
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
// number|null by hand in ProductFormSheet's submit handler, same as employees does for `phone`.
const warrantyMonthsSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 0),
    "Số tháng bảo hành phải là số nguyên ≥ 0.",
  )
  .optional();

/** Client-side checks before the server's (AC-CAT-013/AC-CAT-004); `sku`/`category`/`unit` are only
 * required on create — locked after that (AC-CAT-014, §4). */
export const productCreateSchema = z.object({
  sku: z.string().trim().min(1, "Vui lòng nhập mã hàng."),
  category: z.enum(CATEGORY_ORDER as [Category, ...Category[]], "Vui lòng chọn danh mục."),
  unit: z.enum(UNIT_ORDER as [Unit, ...Unit[]], "Vui lòng chọn đơn vị."),
  name: z.string().trim().min(1, "Vui lòng nhập tên sản phẩm."),
  brand: z.string().trim().optional(),
  price: priceSchema,
  vat_rate: vatRateSchema,
  price_fixed: z.boolean(),
  warranty_months: warrantyMonthsSchema,
  specs: z.string().trim().optional(),
});
export type ProductFormValues = z.infer<typeof productCreateSchema>;

/** Edit mode never renders/validates sku/category/unit — they are fixed after creation. */
export const productEditSchema = productCreateSchema.partial({
  sku: true,
  category: true,
  unit: true,
});
