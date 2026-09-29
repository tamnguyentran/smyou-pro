import { z } from "zod";
import type { components } from "../../lib/api/schema";

export type Division = NonNullable<components["schemas"]["OrderCreate"]["division"]>;
export type Priority = components["schemas"]["OrderCreate"]["priority"];

/** DOMAIN_MODEL §5 enum values, in display order. */
export const DIVISION_LABELS: Record<Division, string> = {
  OFFICE_EQUIPMENT: "Thiết bị văn phòng",
  SECURITY: "Thiết bị an ninh",
  GENERAL: "Kỹ thuật chung",
};
export const DIVISION_ORDER = Object.keys(DIVISION_LABELS) as Division[];

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Thấp",
  NORMAL: "Bình thường",
  HIGH: "Cao",
  URGENT: "Khẩn",
};
export const PRIORITY_ORDER = Object.keys(PRIORITY_LABELS) as Priority[];

/** VAT chip choices (UI_GUIDELINES §5): 0/8/10% quick picks, "Khác" opens a free-entry field. */
export const VAT_CHIP_RATES = [0, 8, 10] as const;
export const VAT_OTHER = "other" as const;

// Q51-style phone check, same as customers/employees: 10 digits, starts with 0.
const phoneValid = (value: string) => /^0\d{9}$/.test(value.replace(/\D/g, ""));

const blankToNaN = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? NaN : value;

// §6: tiền VND là số nguyên — chặn ngay ở client (customers/products/services đều làm vậy).
export const unitPriceFieldSchema = z
  .preprocess(blankToNaN, z.coerce.number("Vui lòng nhập đơn giá."))
  .pipe(z.int("Đơn giá phải là số nguyên.").min(0, "Đơn giá phải lớn hơn hoặc bằng 0."));
export const quantityFieldSchema = z
  .preprocess(blankToNaN, z.coerce.number("Vui lòng nhập số lượng."))
  .pipe(z.number().gt(0, "Số lượng phải lớn hơn 0."));
export const discountFieldSchema = z
  .preprocess(blankToNaN, z.coerce.number("Vui lòng nhập giảm giá."))
  .pipe(z.int("Giảm giá phải là số nguyên.").min(0, "Giảm giá phải lớn hơn hoặc bằng 0."));
// Cùng thông điệp với catalog/domain.py's vat_rate_problem (products/services đã dùng).
export const vatOtherFieldSchema = z
  .preprocess(blankToNaN, z.coerce.number("Vui lòng nhập VAT."))
  .pipe(z.number().min(0, "VAT phải trong khoảng 0-100.").max(100, "VAT phải trong khoảng 0-100."));

export const CUSTOMER_MODES = ["search", "walkin"] as const;
export type CustomerMode = (typeof CUSTOMER_MODES)[number];

/** Section 1 (AC-ORD-024/025): mirrors OrderCreate/OrderUpdate's optionality — no requiredness the
 * backend does not already have, except the walk-in customer's own name/phone (spec's "+ Khách lẻ"). */
export const orderInfoSchema = z
  .object({
    customerMode: z.enum(CUSTOMER_MODES),
    customer_id: z.string().optional(),
    customer_name: z.string().trim().optional(),
    customer_phone: z.string().trim().optional(),
    division: z.union([z.enum(DIVISION_ORDER as [Division, ...Division[]]), z.literal("")]),
    service_address: z.string().trim().optional(),
    work_description: z.string().trim().optional(),
    priority: z.enum(PRIORITY_ORDER as [Priority, ...Priority[]]),
    requested_date: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.customerMode !== "walkin") return;
    if (!values.customer_name?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["customer_name"],
        message: "Vui lòng nhập tên khách hàng.",
      });
    }
    if (!values.customer_phone?.trim() || !phoneValid(values.customer_phone)) {
      ctx.addIssue({
        code: "custom",
        path: ["customer_phone"],
        message: "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.",
      });
    }
  });
export type OrderInfoFormValues = z.infer<typeof orderInfoSchema>;

/** "Tự do" tab of the add-line Sheet (AC-ORD-030/033): CUSTOM lines always need their own VAT
 * (service.py's VAT_REQUIRED_FOR_CUSTOM), so unlike a catalog pick there is no default to fall back to. */
export const customLineSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên dòng hàng."),
  unit: z.string().trim().min(1, "Vui lòng chọn đơn vị."),
  quantity: quantityFieldSchema,
  unit_price: unitPriceFieldSchema,
  vat_rate: z
    .number("Vui lòng chọn VAT.")
    .min(0, "VAT phải trong khoảng 0-100.")
    .max(100, "VAT phải trong khoảng 0-100."),
});
export type CustomLineFormValues = z.infer<typeof customLineSchema>;
