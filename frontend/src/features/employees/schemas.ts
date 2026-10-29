import { z } from "zod";

/** Client-side checks before the server's (AC-EMP-004/014/066); roles are validated separately (not a
 * plain text field — see EmployeeFormSheet). Email is optional since M17-03a (Q105). */
export const employeeFormSchema = z.object({
  full_name: z.string().trim().min(1, "Vui lòng nhập họ tên."),
  email: z.union([z.literal(""), z.string().trim().pipe(z.email("Email không hợp lệ."))]),
  phone: z.string().trim().optional(),
  department_id: z.string().min(1, "Vui lòng chọn phòng ban."),
  title: z.string().trim().optional(),
  birth_date: z.string(),
  birth_place: z.string().trim(),
  gender: z.string(),
  address: z.string().trim(),
  id_number: z
    .string()
    .trim()
    .regex(/^(\d{9}|\d{12})?$/, "CMND/CCCD gồm 9 hoặc 12 chữ số."),
  id_issued_date: z.string(),
  id_issued_place: z.string().trim(),
  marital_status: z.string(),
});
export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export const ROLE_ORDER = ["MANAGER", "SALE", "CUSTOMER_CARE", "TECH_LEAD", "TECHNICIAN"] as const;

/** Q107 labels. */
export const GENDER_LABELS: Record<string, string> = { MALE: "Nam", FEMALE: "Nữ", OTHER: "Khác" };
export const MARITAL_STATUS_LABELS: Record<string, string> = {
  SINGLE: "Độc thân",
  MARRIED: "Đã kết hôn",
  DIVORCED: "Ly hôn",
  WIDOWED: "Goá",
};

/** M17-03a optional profile fields, in form order; blank → null on the wire. */
export const PROFILE_FIELDS = [
  "birth_date",
  "birth_place",
  "gender",
  "address",
  "id_number",
  "id_issued_date",
  "id_issued_place",
  "marital_status",
] as const;
