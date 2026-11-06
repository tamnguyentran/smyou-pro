/** Mã vai trò trong spec/permissions.yaml, theo thứ tự tab cố định. */
export type GuideRole = "MANAGER" | "SALE" | "CUSTOMER_CARE" | "TECH_LEAD" | "TECHNICIAN";

export interface GuideSection {
  /** Neo `#id` của mục lục — duy nhất trong một bản. */
  id: string;
  title: string;
  body?: string;
  /** Các bước đánh số. */
  steps: string[];
  note?: string;
  /** Path các màn hình mục này hướng dẫn — test chặn path vai trò đó không vào được (AC-HELP-007). */
  screens: string[];
}

export interface Guide {
  role: GuideRole;
  /** Nhãn vai trò, trùng `roles` của menu.json. */
  label: string;
  /** Đoạn mở đầu "Bạn làm gì trong hệ thống". */
  summary: string;
  sections: GuideSection[];
  faq: { question: string; answer: string }[];
}
