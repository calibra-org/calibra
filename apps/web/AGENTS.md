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

The storefront does not call WordPress directly. Use the workspace SDK:

```tsx
import { createApiClient } from "@calibra/sdk";

const wc = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL });
const products = await wc.products.list({ per_page: 24 });
```

Add response types via `WcProduct`, `WcCart`, etc. (re-exported from the SDK; sourced from `@woocommerce/types`).

## Deployment

The Dockerfile in this directory produces a self-contained image using Next.js's `standalone` output. Build context is the **repo root** — the Dockerfile copies workspace lockfile, the `@calibra/sdk` and `@calibra/typescript-config` package directories, then builds web. There is no Vercel-specific glue.

```sh
docker build -f apps/web/Dockerfile -t calibra-web .
docker run -p 3000:3000 \
    -e NEXT_PUBLIC_API_BASE_URL=https://cms.example.com \
    calibra-web
```
