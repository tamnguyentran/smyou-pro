# M0-02 — Scaffold frontend

- **Status:** Approved
- **Backlog:** M0-02 · **Milestone:** M0
- **Approval:** kỹ thuật thuần; chủ dự án uỷ quyền triển khai tuần tự M0 (2026-09-25)
- **Liên quan:** ARCHITECTURE §2, §3, §7; DECISIONS ADR-014 (subpath); UI_GUIDELINES §2, §8; DEPLOYMENT §2; BACKLOG M0 (hợp đồng tooling)

## 1. Mục tiêu
Là nhà phát triển (người/AI), tôi cần một SPA React chạy được với design token, font tự host, đường dẫn gốc cấu hình được (`BASE_PATH`) và bộ công cụ chất lượng, để mọi màn hình sau xây trên nền nhất quán và chạy đúng dưới `https://ilabsviet.com/smyoutask/`.

## 2. Phạm vi
- Trong:
  - `frontend/` Vite + React 19 + TypeScript strict (`strict`, `noUncheckedIndexedAccess`), `package-lock.json`, Node 22.
  - `BASE_PATH` (biến môi trường lúc build): Vite `base`, React Router `basename`, API base URL — tính bởi 1 hàm thuần `lib/basePath.ts`.
  - Tailwind CSS v4 (`@tailwindcss/vite`) với token UI_GUIDELINES §2 + màu trạng thái trong `src/styles/index.css`; `clsx` + `tailwind-merge` (`lib/cn.ts`).
  - Font `@fontsource-variable/plus-jakarta-sans` (tự host, có subset tiếng Việt).
  - API client `openapi-fetch` + types sinh bởi `openapi-typescript` (`src/lib/api/openapi.json`, `schema.d.ts` — `make contract`).
  - ESLint (typescript-eslint strict, react-hooks, jsx-a11y), Prettier, Vitest (+ Testing Library, jsdom, coverage ≥ 75% cho `src/features`, `src/lib`), Playwright (projects `mobile` iPhone 13 và `desktop` 1440×900, `@axe-core/playwright`, tag `@a11y`/`@screenshot`, screenshot vào `reports/screenshots/{project}/`).
  - Trang placeholder dùng token (logo, tên ứng dụng, mô tả, icon lucide).
  - Vite dev server cổng 5183, proxy `/api` → backend `:8010`.
  - CI: job `image` chỉ chạy khi đã có Dockerfile (M0-03) — giống cách các phần chưa scaffold được bỏ qua.
- Ngoài: AppShell/sidebar/menu, trang 403/404, TanStack Query, form (M1-03 trở đi); Dockerfile frontend, service `web` trong compose (M0-03).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-002 | Frontend đã cài deps | `vite build` với `BASE_PATH` rỗng, rồi với `BASE_PATH=/smyoutask` | cả hai build thành công; `index.html` tham chiếu asset `/assets/…` (lần 1) và `/smyoutask/assets/…` (lần 2); không còn tham chiếu `"/assets/` ở lần 2 | unit (vitest, node) |
| AC-SYS-003 | Bản build production-like (`BASE_PATH=/smyoutask`) đang được phục vụ | mở trang chủ ở viewport rộng 360px (và ở project mobile, desktop) | `document.documentElement.scrollWidth <= clientWidth` (không cuộn ngang) | e2e |
| AC-SYS-013 | — | gọi hàm chuẩn hoá base path với `""`, `"/"`, `"smyoutask"`, `"/smyoutask"`, `"/smyoutask/"`, `" /smyoutask// "` | `""`/`"/"` → vite base `/`, router basename `/`, API prefix `""`; các giá trị còn lại → base `/smyoutask/`, basename `/smyoutask`, API prefix `/smyoutask`; giá trị có ký tự ngoài `[A-Za-z0-9/_-]` (vd `"/a b"`, `"/../x"`, `"https://x"`) → ném lỗi (build fail sớm) | unit |
| AC-SYS-014 | API client tạo với base URL `/smyoutask/` (như `import.meta.env.BASE_URL` khi build subpath) | gọi `GET /api/v1/health` qua client | request tới đúng `/smyoutask/api/v1/health`; với base `/` → `/api/v1/health` | unit |
| AC-SYS-015 | Bản build `BASE_PATH=/smyoutask` đang được phục vụ | mở `/smyoutask/` | trang placeholder hiển thị H1 "SMYou Pro" và mô tả "Quản lý đơn hàng và đầu việc kỹ thuật"; mọi request JS/CSS/font trả 200 và nằm dưới `/smyoutask/`; không có lỗi console | e2e |
| AC-SYS-016 | Trang placeholder | chạy axe (tag `@a11y`) ở mobile và desktop | 0 vi phạm mức `serious`/`critical` | e2e |
| AC-SYS-017 | Bản build | kiểm tra output | có file `.woff2` Plus Jakarta Sans subset `vietnamese` trong `dist/`; không có tham chiếu `fonts.googleapis.com`/`fonts.gstatic.com`; CSS có biến token `--color-brand` | unit (vitest, node) |
| AC-SYS-018 | Trang placeholder đã tải | đọc style tính toán của H1 và nền trang | `font-family` bắt đầu bằng "Plus Jakarta Sans Variable"; màu nền body = token `page` (`rgb(248, 250, 252)`); chụp screenshot `@screenshot` vào `reports/screenshots/{mobile,desktop}/home.png` | e2e |

Cổng chất lượng (không phải AC riêng, CI bắt): `npm run lint`, `prettier --check`, `tsc --noEmit`, `check_no_raw_colors.py`, `vitest --coverage` (≥ 75%), `npm run build`, `make contract` không lệch, `npm audit --omit=dev` không có high.

## 4. API
Không có endpoint mới. Frontend sinh types từ OpenAPI hiện có (`system_health`).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Trang placeholder (`/`): nền `bg-page`, card trắng `rounded-2xl border-line shadow-card` giữa màn hình, logo khối `rounded-xl bg-brand` chữ "S" màu `accent`, H1 "SMYou Pro", mô tả "Quản lý đơn hàng và đầu việc kỹ thuật", dòng meta "Công ty TNHH SMYou" với icon `Wrench`. Mobile 390px: card full-width với lề `p-4`; `md:` card `max-w-md`.
- Không có tương tác.

## 7. Kịch bản UAT thủ công
1. `cd frontend && npm ci && npm run dev` → mở `http://localhost:5183/` thấy trang "SMYou Pro" đúng màu thương hiệu.
2. `BASE_PATH=/smyoutask npm run build && npm run preview` → mở `http://localhost:4183/smyoutask/` thấy cùng trang; mở DevTools không có lỗi 404.
3. Xem `reports/screenshots/mobile/home.png` và `desktop/home.png`.

## 8. Giả định & câu hỏi
- Cổng: Vite dev 5183, Vite preview (E2E) 4183.
- E2E chạy trên `vite preview` của bản build `BASE_PATH=/smyoutask` (ADR-014: E2E production-like dùng subpath); khi có service `web` (M0-03), E2E chuyển sang stack Docker.
- CI job `image` được bỏ qua cho tới khi `backend/Dockerfile` và `frontend/Dockerfile` tồn tại (M0-03), nếu không PR M0-02 sẽ đỏ vì thiếu Dockerfile.
- Thư viện dev bổ sung ngoài danh sách ARCHITECTURE §2 nhưng là phụ trợ bắt buộc của các công cụ đã chốt: `@vitejs/plugin-react`, `@tailwindcss/vite`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/jest-dom`, `@testing-library/user-event`, `globals`, `@eslint/js`.
