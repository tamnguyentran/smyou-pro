import { z } from "zod";

/** Client-side checks before the server's (M27-01a: `offered` 1..2000 ký tự, `customer_request` ≤ 2000). */
export const careCallSchema = z.object({
  customer_id: z.string().min(1, "Chọn khách hàng."),
  offered: z
    .string()
    .trim()
    .min(1, "Nhập sản phẩm/dịch vụ đã chào.")
    .max(2000, "Tối đa 2000 ký tự."),
  customer_request: z.string().trim().max(2000, "Tối đa 2000 ký tự."),
});
export type CareCallFormValues = z.infer<typeof careCallSchema>;
