import { z } from "zod";
import { PRIORITY_ORDER, type Priority } from "../orders/schemas";

/** Ưu tiên → tone Badge (UI_GUIDELINES §2: màu luôn đi kèm chữ). */
export const PRIORITY_TONE: Record<Priority, "urgent" | "review" | "todo"> = {
  URGENT: "urgent",
  HIGH: "review",
  NORMAL: "todo",
  LOW: "todo",
};

const HOURS_MESSAGE = "Số giờ phải từ 0,25 đến 200 và là bội số của 0,25.";

/** Người dùng gõ số giờ kiểu Việt ("0,25"); API nhận số (CLAUDE.md #6 chỉ áp cho tiền). */
export function parseHours(value: string): number {
  return Number(value.trim().replace(",", "."));
}

function hoursValid(value: string): boolean {
  const hours = parseHours(value);
  if (!Number.isFinite(hours) || hours < 0.25 || hours > 200) return false;
  return Math.round(hours * 100) % 25 === 0;
}

/** `datetime-local` là giờ tường (không múi) — đơn vị nghiệp vụ luôn là Asia/Ho_Chi_Minh. */
export function toOffsetIso(value: string): string {
  return `${value}:00+07:00`;
}

function inThePast(value: string): boolean {
  const due = new Date(toOffsetIso(value));
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
}

/** AC-DSP-023: 5 guard của M4-01a được kiểm trước ở client, trừ `order_in_dispatchable_state`
 * (client không biết chắc trạng thái đơn — chỉ dựa vào 409 của server, spec §8). */
export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Nhập tiêu đề đầu việc.").max(200, "Tiêu đề tối đa 200 ký tự."),
  description: z.string().trim().optional(),
  estimated_hours: z
    .string()
    .trim()
    .min(1, "Nhập số giờ ước tính.")
    .refine((value) => value === "" || hoursValid(value), HOURS_MESSAGE),
  due_at: z
    .string()
    .min(1, "Chọn hạn hoàn thành.")
    .refine((value) => value === "" || !inThePast(value), "Hạn hoàn thành không được ở quá khứ."),
  priority: z.enum(PRIORITY_ORDER as [Priority, ...Priority[]]),
  assignee_ids: z.array(z.string()).min(1, "Chọn ít nhất 1 kỹ thuật viên."),
});
export type TaskCreateFormValues = z.infer<typeof taskCreateSchema>;
