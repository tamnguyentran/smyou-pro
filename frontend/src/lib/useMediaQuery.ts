import { useEffect, useState } from "react";

const supported = () =>
  typeof window !== "undefined" && typeof (window as Partial<Window>).matchMedia === "function";

/** Live result of a CSS media query; `fallback` where matchMedia does not exist (tests, old browsers). */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const [matches, setMatches] = useState(() =>
    supported() ? window.matchMedia(query).matches : fallback,
  );
  useEffect(() => {
    if (!supported()) return;
    const list = window.matchMedia(query);
    const update = () => {
      setMatches(list.matches);
    };
    update();
    list.addEventListener("change", update);
    return () => {
      list.removeEventListener("change", update);
    };
  }, [query]);
  return matches;
}
