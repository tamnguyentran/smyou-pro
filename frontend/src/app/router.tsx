import { createBrowserRouter } from "react-router";
import { resolveBasePath } from "../lib/basePath";
import { routes } from "./routes";

// Trailing-slash basename so the home URL is "/smyoutask/" — the form nginx serves (it 301s "/smyoutask").
const { viteBase } = resolveBasePath(import.meta.env.BASE_URL);

export const router = createBrowserRouter(routes, { basename: viteBase });
