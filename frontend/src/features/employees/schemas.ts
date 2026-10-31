import { z } from "zod";
import type { Role } from "./api";
import matrix from "./permissionMatrix.json";

/** Client-side checks before the server's (AC-EMP-004/014/066); roles are validated separately (not a
 * plain text field — see EmployeeFormSheet). Email is optional since M17-03a (Q105). */
export const employeeFormSchema = z.object({
  full_name: z.string().trim().min(1, "Vui lòng nhập họ tên."),
  // M17-03b: edit form only, checked in EmployeeFormSheet when "Thay đổi thông tin đăng nhập" is ticked.
  username: z.string(),
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

/** Same rule as the server (M17-03b §2): lowercase, digits, dots between parts, 3–50 chars. */
export const USERNAME_PATTERN = /^(?=.{3,50}$)[a-z0-9]+(\.[a-z0-9]+)*$/;
export const USERNAME_MESSAGE = "Chỉ gồm chữ thường không dấu, số và dấu chấm (3–50 ký tự).";

export const ROLE_ORDER = ["MANAGER", "SALE", "CUSTOMER_CARE", "TECH_LEAD", "TECHNICIAN"] as const;
/** M15-01: ticking MANAGER also ticks these (and MANAGER can't be TECHNICIAN at the same time).
 * Exported from the server rule into permissionMatrix.json by `make contract` (M17-05). */
export const MANAGER_BUNDLE: readonly Role[] = matrix.manager_bundle.filter((r): r is Role =>
  (ROLE_ORDER as readonly string[]).includes(r),
);

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
