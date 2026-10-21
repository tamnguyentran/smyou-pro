import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

export const PageTitleContext = createContext<(title: string, action?: ReactNode) => void>(
  () => undefined,
);

/** A page inside the shell names itself: shown as the header's <h1> (and optional action next to it) and in the tab title. */
export function usePageTitle(title: string, action?: ReactNode): void {
  const setTitle = useContext(PageTitleContext);
  useDocumentTitle(title);
  useEffect(() => {
    setTitle(title, action);
  }, [setTitle, title, action]);
}
