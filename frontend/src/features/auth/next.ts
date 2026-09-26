/** Where to go after signing in: only same-app paths, never another site or the login page itself. */
export function safeNext(raw: string | null | undefined): string {
  if (
    !raw?.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    raw.startsWith("/dang-nhap")
  ) {
    return "/";
  }
  return raw;
}
