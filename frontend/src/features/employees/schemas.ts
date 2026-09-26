import { z } from "zod";

/** Client-side checks before the server's (AC-EMP-004/014); roles are validated separately (not a
 * plain text field — see EmployeeFormSheet). */
export const employeeFormSchema = z.object({
  full_name: z.string().trim().min(1, "Vui lòng nhập họ tên."),
  email: z.string().trim().min(1, "Vui lòng nhập email.").pipe(z.email("Email không hợp lệ.")),
  phone: z.string().trim().optional(),
  department: z.string().min(1, "Vui lòng chọn bộ phận."),
  title: z.string().trim().optional(),
});
export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export const DEPARTMENT_LABELS: Record<string, string> = {
  MANAGEMENT: "Ban quản lý",
  SALES: "Kinh doanh",
  TECHNICAL: "Kỹ thuật",
};

export const ROLE_ORDER = ["MANAGER", "SALE", "TECH_LEAD", "TECHNICIAN"] as const;
