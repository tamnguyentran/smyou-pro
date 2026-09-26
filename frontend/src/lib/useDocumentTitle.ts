import { useEffect } from "react";

/** Tab title per page ("Đăng nhập · SMYou Pro"), so screen readers and tabs identify the page. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · SMYou Pro`;
  }, [title]);
}
