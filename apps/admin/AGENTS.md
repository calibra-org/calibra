# apps/admin

Next.js 16 admin panel for the storefront. App Router, Tailwind v4, next-intl (Persian default + English secondary). Talks to [`apps/api`](../api) via [`@calibra/sdk`](../../packages/sdk); shares the `cn()` helper and locale registry with the storefront through [`@calibra/shared`](../../packages/shared).

**Component library: shadcn/ui** (New York style). The admin uses shadcn primitives for speed and consistency with operator-tooling conventions. The storefront does NOT — it stays Tailwind-only.

## Layout

```
apps/admin/
├── messages/
│   ├── fa.json          # Persian (default)
│   └── en.json          # English
├── components.json      # shadcn CLI config (`npx shadcn@latest add <name>` writes here)
├── src/
│   ├── app/
│   │   └── [locale]/
│   │       ├── (authenticated)/
│   │       │   ├── dashboard/page.tsx
│   │       │   ├── products/page.tsx
│   │       │   ├── orders/page.tsx
│   │       │   └── layout.tsx        # Sidebar + Topbar shell
│   │       ├── login/page.tsx
│   │       ├── layout.tsx            # locale root layout (next-intl provider + dir attr)
│   │       ├── page.tsx              # redirects to /dashboard
│   │       └── not-found.tsx
│   ├── components/
│   │   ├── ui/                       # shadcn primitives (button, card, badge, input, table, …)
│   │   ├── Sidebar.tsx               # icon nav, group highlights
│   │   ├── Topbar.tsx                # search + notifications + user + locale switch
│   │   ├── LocaleSwitch.tsx          # fa ↔ en toggle
│   │   ├── StatCard.tsx              # KPI tile with delta (wraps shadcn Card)
│   │   ├── StatusBadge.tsx           # tone-coloured status pill
│   │   └── DataTable.tsx             # generic header + rows wrapper around shadcn Table
│   ├── lib/
│   │   ├── api.ts                    # `apiServer()` — locale-aware SDK client
│   │   ├── utils.ts                  # shadcn `cn` re-export (sources from @calibra/shared)
│   │   └── i18n/                     # routing, navigation, request loader
│   ├── middleware.ts                 # next-intl locale middleware
│   └── styles/globals.css            # shadcn design tokens (HSL) + tw-animate-css
├── tests/e2e/                        # Playwright suite
├── Dockerfile                        # multi-stage → standalone server (port 3001)
├── next.config.ts                    # `output: "standalone"` + next-intl plugin + transpilePackages
└── playwright.config.ts
```

## shadcn conventions

- **Add components via the CLI**: `npx shadcn@latest add <name>` (e.g. `add dialog`, `add sheet`, `add dropdown-menu`). The CLI writes into `src/components/ui/` and resolves `cn` from `#/lib/utils`. The first run may ask about Tailwind v4 — accept the v4 setup.
- **`cn` is centralised**: `src/lib/utils.ts` re-exports `cn` from `@calibra/shared` so workspace tailwind-merge config stays single-sourced. Never let the CLI redefine `cn` locally.
- **HSL CSS variables**: `globals.css` uses the canonical shadcn HSL token set (`--background`, `--foreground`, `--card`, `--primary`, …) plus the sidebar group. Don't add OKLCH or oklch-style tokens — shadcn components assume HSL.
- **Dark mode is opt-in**: toggle `.dark` on `<html>` (no `prefers-color-scheme` auto-detect — admins want to control the chrome explicitly). Wire a theme toggle when needed.

## App conventions

- **Path alias.** `#/*` resolves to `src/*`. Always import `cn` from `#/lib/utils` (the shadcn convention) — internally it re-exports from `@calibra/shared`.
- **Locale-aware navigation.** Always import `Link`, `redirect`, `useRouter`, `usePathname`, `getPathname` from `#/lib/i18n/navigation`. Never the bare `next/link` / `next/navigation` equivalents.
- **`setRequestLocale(locale)`** at the top of every server component under `[locale]` (page, layout). Required by next-intl's static optimization.
- **Persian default.** `localePrefix: "as-needed"` keeps `/dashboard` etc. as Persian routes; English lives under `/en/dashboard`. Update `messages/fa.json` first; treat English as a translation.
- **RTL is automatic.** Tailwind v4 logical utilities (`ms-*` / `me-*` / `text-start`) flip per direction; never hand-write `mr-2` / `pl-4`.
- **API calls forward locale.** Use `apiServer()` in server components — it reads `useLocale()` and passes it to `createApiClient` as the `locale` option, which the SDK sends as `Accept-Language`. Localized error messages and validator output flow back automatically.
- **Typed admin client.** `(await apiServer()).admin` is an `openapi-fetch` client typed against `admin.v1.yaml`. Paths, params, request bodies, and response shapes are all inferred — `await api.admin.GET("/api/v1/admin/orders/{id}", { params: { path: { id } } })`. Pull schema types via `AdminSchemas["…"]` from `@calibra/sdk` when you need to name a response shape. Non-2xx responses throw `BackendError`.

## Deployment

```sh
docker build -f apps/admin/Dockerfile -t calibra-admin .
docker run -p 3001:3001 \
    -e NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
    calibra-admin
```
