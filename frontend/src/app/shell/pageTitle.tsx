import { createContext, useContext, useEffect } from "react";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

export const PageTitleContext = createContext<(title: string) => void>(() => undefined);

/** A page inside the shell names itself: shown as the header's <h1> and in the tab title. */
export function usePageTitle(title: string): void {
  const setTitle = useContext(PageTitleContext);
  useDocumentTitle(title);
  useEffect(() => {
    setTitle(title);
  }, [setTitle, title]);
}
