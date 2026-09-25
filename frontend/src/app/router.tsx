import { createBrowserRouter } from "react-router";
import { HomePage } from "../features/home/pages/HomePage";
import { resolveBasePath } from "../lib/basePath";

const { routerBasename } = resolveBasePath(import.meta.env.BASE_URL);

export const router = createBrowserRouter([{ path: "/", element: <HomePage /> }], {
  basename: routerBasename,
});
