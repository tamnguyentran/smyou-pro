import { z } from "zod";
import type { components } from "../../lib/api/schema";

export type CustomerType = components["schemas"]["CustomerCreate"]["type"];

/** DOMAIN_MODEL §4 enum values, in display order. */
export const TYPE_LABELS: Record<CustomerType, string> = {
  COMPANY: "Công ty",
  INDIVIDUAL: "Cá nhân",
};
export const TYPE_ORDER = Object.keys(TYPE_LABELS) as CustomerType[];

export type Gender = components["schemas"]["CustomerCreate"]["gender"] & string;
/** M15-05: 3 giá trị, không có "không muốn nêu" (chủ dự án chốt 2026-10-22). */
export const GENDER_LABELS: Record<Gender, string> = {
  MALE: "Nam",
  FEMALE: "Nữ",
  OTHER: "Khác",
};
export const GENDER_ORDER = Object.keys(GENDER_LABELS) as Gender[];

// Q51: giống nhân viên — chỉ chữ số, đúng 10 số bắt đầu 0 (server chuẩn hoá lại, xem app/domain.py).
const phoneValid = (value: string) => /^0\d{9}$/.test(value.replace(/\D/g, ""));

/** Client-side checks before the server's (AC-CUS-010); dùng chung cho tạo và sửa — không có trường
 * nào bị khoá sau khi tạo (khác Product/Service: `code` không nằm trong form). */
export const customerSchema = z.object({
  type: z.enum(TYPE_ORDER as [CustomerType, ...CustomerType[]], "Vui lòng chọn loại khách hàng."),
  name: z.string().trim().min(1, "Vui lòng nhập tên khách hàng."),
  contact_person: z.string().trim().optional(),
  contact_person_phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || phoneValid(value),
      "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.",
    )
    .optional(),
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
  // M15-05: chỉ bộ field khớp `type` được gửi lên server — xem toPayload() trong CustomerFormSheet.
  founded_date: z.string().trim().optional(),
  director_name: z.string().trim().optional(),
  director_phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || phoneValid(value),
      "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.",
    )
    .optional(),
  it_contact_name: z.string().trim().optional(),
  it_contact_phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || phoneValid(value),
      "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.",
    )
    .optional(),
  date_of_birth: z.string().trim().optional(),
  // "" = chưa chọn ("— Chọn —") — select không có placeholder riêng như input nên phải chấp nhận
  // chuỗi rỗng là hợp lệ (tương đương null), khác enum thường chỉ nhận đúng 1 trong các giá trị.
  gender: z
    .string()
    .refine(
      (value) => value === "" || (GENDER_ORDER as string[]).includes(value),
      "Giới tính không hợp lệ.",
    )
    .optional() as z.ZodType<Gender | "" | undefined>,
  occupation: z.string().trim().optional(),
});
export type CustomerFormValues = z.infer<typeof customerSchema>;
