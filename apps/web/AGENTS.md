# apps/web

Next.js 16 storefront. App Router, React Server Components, Tailwind v4, next-intl. Talks to WordPress via [`@calibra/sdk`](../../packages/sdk).

## Layout

```
apps/web/
├── messages/
│   ├── en.json          # English (default)
│   └── fa.json          # Persian
├── public/              # static assets served at /
├── src/
│   ├── app/
│   │   └── [locale]/    # all routes live under a locale segment
│   ├── components/      # reusable UI (Header, Footer, …)
│   ├── lib/
│   │   ├── cn.ts        # clsx + tailwind-merge helper
│   │   └── i18n/
│   │       ├── config.ts     # locale registry + RTL list
│   │       ├── navigation.ts # locale-aware Link/router/redirect
│   │       ├── request.ts    # next-intl per-request loader
│   │       └── routing.ts    # next-intl routing definition
│   ├── middleware.ts    # next-intl locale middleware
│   └── styles/
│       └── globals.css  # Tailwind v4 + theme tokens
├── tests/e2e/           # Playwright suite
├── Dockerfile           # multi-stage build → standalone server
├── next.config.ts       # `output: "standalone"` + next-intl plugin
└── playwright.config.ts
```

## Conventions

- **Path alias.** `#/*` resolves to `src/*` (configured in `tsconfig.json`). Use it for cross-folder imports — `import { cn } from "#/lib/cn"` — never deep relative paths like `../../../lib/cn`.
- **Locale-aware navigation.** Always import `Link`, `redirect`, `useRouter`, `usePathname`, `getPathname` from `#/lib/i18n/navigation`. Never import the bare `next/link` / `next/navigation` equivalents — they don't prefix locales correctly.
- **`setRequestLocale(locale)`** at the top of every server component under `[locale]` (page, layout). Without it, child server components fall back to the default locale.
- **English is the default.** `localePrefix: "as-needed"` keeps `/` and `/products` as English routes; Persian lives under `/fa`, `/fa/products`. Update `messages/en.json` first; treat Persian as a translation of English, not vice versa.
- **RTL is automatic.** `src/lib/i18n/config.ts` controls the locale → direction map; `src/app/[locale]/layout.tsx` sets `<html dir>`. Tailwind v4 utilities use logical properties (`ms-*` / `me-*` / `text-start`) so components flip automatically — don't write `mr-2` / `pl-4` style utilities; use `me-2` / `ps-4`.

## Styling: Tailwind v4 only

- No shadcn, no class-variance-authority, no CSS-in-JS, no styled-components. Just Tailwind utility classes composed via `cn()`.
- Theme tokens live in `src/styles/globals.css` under `@theme { … }`. Reference them as Tailwind classes: `bg-background`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-accent text-accent-foreground`.
- Use OKLCH for new colors — see existing tokens for the pattern.

## Data: `@calibra/sdk`

The storefront uses the workspace SDK. Always go through `apiServer()` from `#/lib/api` so the locale header rides along:

```tsx
import { apiServer } from "#/lib/api";

const api = await apiServer();
const { data } = await api.storefront.GET("/api/v1/catalog/products", {
    params: { query: { page: 1, perPage: 24 } },
});
```

Paths, params, request bodies, and response shapes are all inferred from `storefront.v1.yaml` (re-exported as `StorefrontSchemas` / `StorefrontPaths` for places that need them). Non-2xx responses throw `BackendError`. For endpoints not yet in the spec, drop down to `api.http` (the low-level `HttpClient`).

## Multi-tenancy & runtime branding (Phase 3)

One `apps/web` deployment serves **every** shop whose `template_key` is `default`. The active tenant comes from the request `Host`, and branding is applied at runtime — nothing about a shop is baked in at build time.

**Request pipeline (`src/middleware.ts`).** Tenant resolution runs in front of next-intl:

1. `resolveHost(host)` (`src/lib/tenant/resolve-host.ts`) classifies the `Host` as `subdomain` (`<slug>.<NEXT_PUBLIC_SHOPS_ROOT>`), `custom` (a mapped domain), or `platform` (apex / unknown / `*.spin.localhost` / bare `localhost`).
2. The tenant ref is validated against `GET /api/v1/storefront/tenant`. Any non-OK outcome rewrites to a `/platform/*` state page so **no shop route ever renders without a resolved, active, correctly-templated tenant**: unknown → `/platform/not-found`, suspended/archived (API 503) → `/platform/unavailable`, `template_key` ≠ this deployment's → `/platform/misrouted`.
3. On success the validated profile is forwarded to the render path as request headers: `x-calibra-tenant` (the ref — `apiServer()` forwards it so every API call is tenant-scoped) and `x-calibra-tenant-data` (the profile + branding JSON, percent-encoded). Then next-intl handles locale routing. Tenant and locale are independent — the API still gets `Accept-Language` *and* `X-Calibra-Tenant`.

**Reading the tenant.** Server components call `currentTenant()` / `requireTenant()` (`src/lib/tenant/current-tenant.ts`) — a request-cached read of the header set by the middleware (no second fetch). Never hardcode a brand string or color; read them from `tenant.branding`.

**Branding injection (RULE B).** `src/app/[locale]/layout.tsx` injects `tenant.branding.palette` as inline `--color-*` custom properties on `<html>` (`paletteToCssVars`), so the existing Tailwind token classes (`bg-background`, `text-accent`, …) resolve to the shop's OKLCH palette **before first paint** — no flash of the baseline theme. New themeable tokens must exist in `@theme` (globals.css) to be overridable. Title/description/favicon/OpenGraph come from branding via `generateMetadata`. `Header`/`Footer` render the brand name, logo (or a name monogram), and tagline from branding; generic UI copy (nav labels, "Cart") stays in the message catalogs.

**Env.** `NEXT_PUBLIC_SHOPS_ROOT` (`shops.calibra.app` prod, `shops.localhost` dev — `aurora.shops.localhost:<port>` resolves to the `aurora` tenant) and `NEXT_PUBLIC_TEMPLATE_KEY` (`default`). See `.env.example`.

**e2e.** `tests/e2e/tenant.spec.ts` covers two-tenant rendering, palette isolation, catalog scoping, locale toggle, and the platform states. It runs against a live seeded stack (`pnpm spin <slug> --with-web`) — point it at the spin with `BASE_URL=http://localhost:<webPort> STOREFRONT_PORT=<webPort> pnpm --filter @calibra/web test:e2e`.

### Adding a second template (future)

`apps/web` declares the one template it implements via `TEMPLATE_KEY` (`src/lib/tenant/constants.ts`). To add a `luxe` template:

1. Clone `apps/web` → `apps/web-luxe`; set `TEMPLATE_KEY` / `NEXT_PUBLIC_TEMPLATE_KEY` to `luxe`.
2. Keep the same tenant-resolution + branding + SDK wiring — only the components/design change.
3. Deploy it, then point tenants with `template_key='luxe'` at it via Caddy host routing (Phase 6). The control plane (Phase 5) sets `tenant.template_key`.

The seam is already live: a tenant whose `template_key` doesn't match this deployment renders `/platform/misrouted` instead of the wrong template — a misrouted host fails loudly rather than silently rendering incorrectly.

## Deployment

The Dockerfile in this directory produces a self-contained image using Next.js's `standalone` output. Build context is the **repo root** — the Dockerfile copies workspace lockfile, the `@calibra/sdk` and `@calibra/typescript-config` package directories, then builds web. There is no Vercel-specific glue.

```sh
docker build -f apps/web/Dockerfile -t calibra-web .
docker run -p 3000:3000 \
    -e NEXT_PUBLIC_API_BASE_URL=https://cms.example.com \
    calibra-web
```
