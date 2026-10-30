/** M17-03b: seed_e2e.py gives every seeded account the username = local part of its email. */
export function loginName(email: string): string {
  return email.split("@")[0] ?? email;
}
