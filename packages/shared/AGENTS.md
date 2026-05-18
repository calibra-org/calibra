# packages/shared

Shared **utilities and types** used by both [`apps/web`](../../apps/web) (storefront) and [`apps/admin`](../../apps/admin) (admin panel). Source-only — the package ships raw TypeScript that each consuming app compiles via Next.js's `transpilePackages`; no build step here.

> **Despite the name, this package does NOT export UI components.** The storefront and admin have intentionally different design languages and component vocabularies. Sharing primitives forces both surfaces into the lowest common denominator and creates change-amplification bugs (a tweak for the admin breaks the storefront). UI lives inside each app's `src/components/`.

## Public surface

- Top-level (`import { … } from "@calibra/shared"`):
    - `cn(...inputs)` — Tailwind class composer (`clsx` + `tailwind-merge`). Used in both apps.
- Subpath (`import { … } from "@calibra/shared/i18n"`):
    - `locales`, `Locale`, `isLocale`, `directionFor` — shared locale registry. `defaultLocale` is intentionally **not** exported; each app picks its own.

That's it. Everything else stays in the consuming app.

## What belongs here

Add to `packages/shared` when something is **truly cross-cutting logic with no visual opinion**:

- Format helpers (money, dates, slugs)
- Type-only definitions (`Locale`, future `Currency`, future shared enums)
- Pure utilities (`cn`, URL builders, sanitizers)

## What does NOT belong here

Even if both apps need "a button" today, **do not** add one. Keep each app's `Button` component local, even at the cost of duplication. The two surfaces will drift on purpose:

- Storefront: warm, generous spacing, marketing-grade typography.
- Admin: dense, neutral, data-first.

If the duplication ever genuinely hurts (3+ apps, same exact button), revisit then — not now.

## Invariants

- **Source-only distribution.** No `build` step, no generated `dist/`. Both Next.js apps consume raw TypeScript via `transpilePackages: ["@calibra/shared"]`. Fast dev loop, no version-mismatch tax.
- **Zero React component exports.** Enforce at PR time. The only exception is a future logic-shaped React hook (e.g. `useCurrencyFormatter`) — those go in a `@calibra/shared/hooks` subpath, not the root.
- **No Tailwind class strings in source.** Since this package doesn't ship components, it shouldn't reference Tailwind utilities at all. If you ever add a class string here, you're probably adding a component — stop and put it in the consuming app instead.
