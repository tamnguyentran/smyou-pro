import { z } from "zod";
import type { CompanyProfile, CompanyProfileUpdateBody } from "./api";

// Server re-checks and normalizes (app/modules/company/domain.py): digits only, 10–11 starting 0
// (HCMC landlines 028… are 11 digits).
const phoneValid = (value: string) => /^0\d{9,10}$/.test(value.replace(/\D/g, ""));
const PHONE_MESSAGE = "Số điện thoại không hợp lệ.";
const optionalPhone = z
  .string()
  .trim()
  .refine((value) => value === "" || phoneValid(value), PHONE_MESSAGE);

export const companyProfileSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên công ty.").max(255, "Tối đa 255 ký tự."),
  tax_code: z
    .string()
    .trim()
    .regex(
      /^\d{10}(-\d{3})?$/,
      "Mã số thuế gồm 10 hoặc 13 chữ số (dạng 0309390732 hoặc 0309390732-001).",
    ),
  phone: z.string().trim().refine(phoneValid, PHONE_MESSAGE),
  phone_secondary: optionalPhone,
  fax: optionalPhone,
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, "Email không hợp lệ."),
  website: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^https?:\/\/\S+$/.test(value),
      "Website phải bắt đầu bằng http:// hoặc https://.",
    ),
  address: z.string().trim().min(1, "Vui lòng nhập địa chỉ.").max(500, "Tối đa 500 ký tự."),
});

export type CompanyProfileFormValues = z.infer<typeof companyProfileSchema>;
type Field = keyof CompanyProfileFormValues;

/** Form order (spec §6): name and address span both columns from `md:`. */
export const FIELDS: readonly { name: Field; label: string; wide?: boolean }[] = [
  { name: "name", label: "Tên công ty *", wide: true },
  { name: "tax_code", label: "Mã số thuế *" },
  { name: "phone", label: "Điện thoại 1 *" },
  { name: "phone_secondary", label: "Điện thoại 2" },
  { name: "fax", label: "Fax" },
  { name: "email", label: "Email" },
  { name: "website", label: "Website" },
  { name: "address", label: "Địa chỉ *", wide: true },
];

export function toFormValues(profile: CompanyProfile): CompanyProfileFormValues {
  return {
    name: profile.name,
    tax_code: profile.tax_code,
    phone: profile.phone,
    phone_secondary: profile.phone_secondary ?? "",
    fax: profile.fax ?? "",
    email: profile.email ?? "",
    website: profile.website ?? "",
    address: profile.address,
  };
}

/** Only the edited fields are sent (PATCH semantics); optional ones left blank are cleared (null). */
export function toUpdateBody(
  values: CompanyProfileFormValues,
  dirty: Partial<Record<Field, unknown>>,
  version: number,
): CompanyProfileUpdateBody {
  const body: CompanyProfileUpdateBody = { version };
  for (const field of Object.keys(dirty) as Field[]) {
    if (!dirty[field]) continue;
    const value = values[field].trim();
    body[field] = value === "" ? null : value;
  }
  return body;
}
