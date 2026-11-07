import { menuPages, visibleMenu } from "../../../app/menu";
import { COMMON_SECTIONS, ORDER_STATUS_HELP } from "./common";
import { CUSTOMER_CARE_GUIDE } from "./customerCare";
import { MANAGER_GUIDE } from "./manager";
import { SALE_GUIDE } from "./sale";
import { TECH_LEAD_GUIDE } from "./techLead";
import { TECHNICIAN_GUIDE } from "./technician";
import type { Guide, GuideRole } from "./types";

export type { Guide, GuideRole, GuideSection } from "./types";
export { ORDER_STATUS_HELP };

/** Thứ tự tab cố định (spec M26-01 §6). */
export const GUIDE_ROLES: GuideRole[] = [
  "MANAGER",
  "SALE",
  "CUSTOMER_CARE",
  "TECH_LEAD",
  "TECHNICIAN",
];

const withCommon = (guide: Guide): Guide => ({
  ...guide,
  sections: [...COMMON_SECTIONS, ...guide.sections],
});

export const GUIDES: Record<GuideRole, Guide> = {
  MANAGER: withCommon(MANAGER_GUIDE),
  SALE: withCommon(SALE_GUIDE),
  CUSTOMER_CARE: withCommon(CUSTOMER_CARE_GUIDE),
  TECH_LEAD: withCommon(TECH_LEAD_GUIDE),
  TECHNICIAN: withCommon(TECHNICIAN_GUIDE),
};

/** Các bản người dùng đọc được: vai trò mình có; Quản lý chung đọc cả 5 (để đào tạo). */
export function guidesFor(roles: string[]): Guide[] {
  if (roles.includes("MANAGER")) return GUIDE_ROLES.map((r) => GUIDES[r]);
  return GUIDE_ROLES.filter((r) => roles.includes(r)).map((r) => GUIDES[r]);
}

/** Màn hình ai đăng nhập cũng vào được, không nằm trong menu. */
const ALWAYS_REACHABLE = new Set([
  "/dang-nhap",
  "/doi-mat-khau",
  "/quen-mat-khau",
  "/thong-bao",
  "/ca-nhan",
]);

/** AC-HELP-007: các mục nhắc tới màn hình mà vai trò của bản không thấy trong menu. */
export function screenProblems(
  guide: Guide,
  capabilities: Record<string, unknown>,
): { section: string; screen: string }[] {
  const reachable = new Set(menuPages(visibleMenu(capabilities)).map(({ item }) => item.path));
  return guide.sections.flatMap((section) =>
    section.screens
      .filter((screen) => !ALWAYS_REACHABLE.has(screen) && !reachable.has(screen))
      .map((screen) => ({ section: section.id, screen })),
  );
}
