function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Where to go after signing in: only same-app paths, never another site or the login page itself. */
export function safeNext(raw: string | null | undefined): string {
  if (
    !raw?.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    hasControlCharacter(raw) || // URL parsing drops them: "/\t/evil" would become "//evil"
    raw.startsWith("/dang-nhap")
  ) {
    return "/";
  }
  return raw;
}
