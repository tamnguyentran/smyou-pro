import { z } from "zod";

export const productServiceGroupSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nhóm.").max(100, "Tên nhóm tối đa 100 ký tự."),
});

export type ProductServiceGroupFormValues = z.infer<typeof productServiceGroupSchema>;
