import { z } from "zod";
import type { components } from "../../lib/api/schema";

export type CustomerType = components["schemas"]["CustomerCreate"]["type"];

/** DOMAIN_MODEL §4 enum values, in display order. */
export const TYPE_LABELS: Record<CustomerType, string> = {
  COMPANY: "Công ty",
  INDIVIDUAL: "Cá nhân",
};
export const TYPE_ORDER = Object.keys(TYPE_LABELS) as CustomerType[];

// Q51: giống nhân viên — chỉ chữ số, đúng 10 số bắt đầu 0 (server chuẩn hoá lại, xem app/domain.py).
const phoneValid = (value: string) => /^0\d{9}$/.test(value.replace(/\D/g, ""));

/** Client-side checks before the server's (AC-CUS-010); dùng chung cho tạo và sửa — không có trường
 * nào bị khoá sau khi tạo (khác Product/Service: `code` không nằm trong form). */
export const customerSchema = z.object({
  type: z.enum(TYPE_ORDER as [CustomerType, ...CustomerType[]], "Vui lòng chọn loại khách hàng."),
  name: z.string().trim().min(1, "Vui lòng nhập tên khách hàng."),
  contact_person: z.string().trim().optional(),
  phone: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập số điện thoại.")
    .refine(phoneValid, "Số điện thoại cần 10 chữ số, bắt đầu bằng 0."),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, "Email không hợp lệ.")
    .optional(),
  tax_code: z.string().trim().optional(),
  address: z.string().trim().optional(),
  note: z.string().trim().optional(),
});
export type CustomerFormValues = z.infer<typeof customerSchema>;
