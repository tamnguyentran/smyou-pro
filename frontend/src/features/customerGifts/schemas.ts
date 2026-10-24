import { z } from "zod";

/** Client-side checks before the server's (M16-01a AC-GFT-003: `quantity>0`, `unit_price>=0`). */
export const giftSchema = z.object({
  occasion_name: z.string().trim().min(1, "Vui lòng nhập dịp/lễ."),
  performed_date: z.string().trim().min(1, "Vui lòng nhập ngày thực hiện."),
  gift_name: z.string().trim().min(1, "Vui lòng nhập tên gói quà."),
  quantity: z.coerce.number().int().min(1, "Số lượng phải lớn hơn 0."),
  unit_price: z.coerce.number().int("Đơn giá phải là số nguyên.").min(0, "Đơn giá không được âm."),
  other_cost: z.coerce
    .number()
    .int("Chi phí khác phải là số nguyên.")
    .min(0, "Chi phí khác không được âm.")
    .default(0),
  performed_by: z.string().trim().min(1, "Vui lòng chọn người thực hiện."),
  requested_by: z.string().trim().min(1, "Vui lòng chọn người yêu cầu."),
  note: z.string().trim().max(2000, "Ghi chú tối đa 2000 ký tự.").default(""),
});
export type GiftFormValues = z.infer<typeof giftSchema>;
