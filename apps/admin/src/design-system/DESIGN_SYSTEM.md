# Calibra Admin Design System

The canonical contract for every primitive, token, and convention that the admin renders with. Read this end-to-end **before** building any new view, primitive, or business component. Every consistency rule below is enforced — by Biome, by the `lint-tokens` script, by code review, or all three.

> **Status (2026-05-26):** Foundation layer landed (prompt `01`). Tier-2/3 primitive folder migration in flight (prompt `02`). Date input consolidation (prompt `03`), DataGrid primitive (prompt `04`), business primitives (prompt `05`), colour sweep (prompt `06`), and showcase site (prompt `07`) follow. The token + icons + lint rails described here are live today; primitive folder shapes and showcase routes appear as their sub-prompts land.

---

## 1. The tier model

Every file in `apps/admin/src/` belongs to exactly one tier. Tiers depend downward only — a tier-N file may import tier-(N-1) and lower; never upward.

```
Tier 5 — Views                  apps/admin/src/views/<resource>/...
            ▲ (page glue, route-specific orchestration)
Tier 4 — Business primitives    apps/admin/src/components/business/<name>/
            ▲ (UI primitive + wired to API query/mutation; domain-aware)
Tier 3 — Composite primitives   apps/admin/src/components/ui/<name>/
            ▲ (built FROM tier-2; structural composition, no domain knowledge)
Tier 2 — UI primitives          apps/admin/src/components/ui/<name>/
            ▲ (pure visual + behavioural primitives wrapping Base UI / raw)
Tier 1 — Icons                  apps/admin/src/icons/
            ▲ (the only folder allowed to import `lucide-react`)
Tier 0 — Tokens                 apps/admin/src/styles/globals.css
            (palette + semantic; @theme exposes utilities; the only colour source)
```

### Concrete examples per tier

- **Tier 0 — Tokens.** `apps/admin/src/styles/globals.css`. Two layers: raw palette (`--color-gray-500`, `--color-brand-600`, `--color-success`) and semantic (`--background`, `--card`, `--ring`, `--destructive`, `--success`, …). The `@theme inline` block re-exports semantic tokens as Tailwind utilities so callers write `bg-card`, `text-foreground`, `text-success`, `text-danger`, … — never raw HSL or raw palette steps.

- **Tier 1 — Icons.** `apps/admin/src/icons/`. The single re-export module for every icon used in the admin. Imports from `lucide-react`; nobody else does. Exposes pass-through icons by symbol name plus logical RTL-aware directional aliases (`ChevronStart`, `ChevronEnd`, `ArrowStart`, `ArrowEnd`, `ChevronsStart`, `ChevronsEnd`) and a `Spinner` alias for `Loader2`.

- **Tier 2 — UI primitives.** Pure visual + behavioural primitives. Zero domain knowledge. `Button`, `Input`, `Label`, `Card`, `Badge`, `Sheet`, `Dialog`, `Popover`, `Tooltip`, `Switch`, `Checkbox`, `RadioGroup`, `Select`, `Tabs`, `DropdownMenu`, `Skeleton`, `Separator`, `ScrollArea`, `Avatar`, `Toast`, `Progress`, …

- **Tier 3 — Composite primitives.** Built from tier-2 primitives. Structural composition, no domain logic. Live in `components/ui/` alongside tier-2 (the distinction is in `<name>/README.md`, not folder location). `DataGrid` (TanStack-based table), `Calendar` (Jalali-aware day grid), `DatePickerField` / `DateRangePickerField` (Calendar-in-Dialog), `Form`, `EntityCombobox` (the canonical async-multi-select), `EmptyState`, `BulkSelectionBar`, `StickyActionBar`, `Field`, `Combobox`, `MultiCombobox`, `Pagination`, `Breadcrumb`, `KbdShortcut`, `CodeBlock`.

- **Tier 4 — Business primitives.** Composes a tier-2 or tier-3 primitive AND wires to an API query/mutation. Lives in `apps/admin/src/components/business/<name>/`. `ProductPicker` (EntityCombobox + `useProductSearch`), `CategoryPicker`, `BrandPicker`, `CustomerPicker`, `ParentCategoryPicker`, `OrderStatusBadge`, `CouponStatusBadge`, `MoneyInput`, `AddressCard`, `AddressForm`. A business primitive **never** re-implements primitive UI — it wraps a primitive and adds the API wire + domain mapping.

- **Tier 5 — Views.** Route-specific orchestration. Composes tier 2–4 building blocks. View-local components are allowed (`OrdersListRowMenu`), but if one starts looking domain-shareable, it gets promoted to tier 4 in the same PR that adds the third usage.

---

## 2. The folder convention

**Every** primitive (tier 2, 3, and 4) lives in its own folder. Flat `.tsx` files in `components/ui/*.tsx` are being migrated to folders in prompt `02`. Folder shape:

```
components/ui/<name>/
├── index.tsx              # named exports: convenience + all compound subparts
├── <name>.parts.tsx       # compound subparts (Foo.Root / Foo.Trigger / Foo.Content / …)
├── <name>.variants.ts     # tv() variants ONLY — no JSX, no imports from "react"
├── <name>.demo.tsx        # showcase demo source — server component when possible
└── README.md              # contract doc shown on the showcase page
```

Plus, when behaviour is non-trivial:

```
├── <name>.types.ts        # exported TS interfaces (when surface is large)
└── __tests__/<name>.test.tsx
```

### Convenience wrapper vs compound subparts

The convenience wrapper is the **default API**; the compound subparts are the **escape hatch**. Both live in the same primitive, both are first-class.

**Convenience wrapper** — the 90% case in one line:

```tsx
<Dialog open={open} onOpenChange={setOpen} title="Edit product" description="Update SKU and price.">
    <ProductEditForm productId={id} />
</Dialog>
```

**Compound subparts** — for advanced compositions:

```tsx
<Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><Button>Edit</Button></Dialog.Trigger>
    <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
            <Dialog.Header>
                <Dialog.Title>Edit product</Dialog.Title>
                <Dialog.Description>…</Dialog.Description>
                <Dialog.Close />
            </Dialog.Header>
            <Dialog.Body>…</Dialog.Body>
            <Dialog.Footer>…</Dialog.Footer>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
```

The convenience wrapper is implemented on top of the compound subparts — it is never a parallel implementation. **Both ship from `index.tsx`** via named exports (not static properties on the root — those break Next.js RSC tree-shaking).

---

## 3. Consistency contracts (non-negotiable)

Every contract below is enforced. Skipping any of them is a review-block.

### 3.1 Semantic tokens only

Code references colours through semantic Tailwind utilities only. Allowed:

- Surfaces: `bg-background` `text-foreground` `bg-card` `text-card-foreground` `bg-muted` `text-muted-foreground` `bg-popover` `text-popover-foreground`
- Intents: `bg-primary` `text-primary-foreground` `bg-secondary` `text-secondary-foreground` `bg-accent` `text-accent-foreground`
- Status tones: `bg-destructive` `text-destructive-foreground` `bg-success` `text-success-foreground` `bg-warning` `text-warning-foreground` `bg-info` `text-info-foreground` `bg-danger` `text-danger-foreground`
- Lines + rings: `border-border` `border-input` `ring-ring`
- Sidebar: `bg-sidebar` `text-sidebar-foreground` `bg-sidebar-primary` `bg-sidebar-accent`
- Charts: `bg-chart-1`…`bg-chart-5` / `stroke-chart-1`…

**Forbidden** anywhere outside `globals.css`: `text-red-*`, `text-green-*`, `text-emerald-*`, `text-amber-*`, `text-sky-*`, `text-rose-*`, `bg-red-*`, `bg-emerald-*`, etc. — any `{prefix}-{family}-{step}` combination.

Enforced by `scripts/lint-tokens.mjs` (at `warn` today; flips to `error` after prompt `06`'s sweep lands). If a designer asks for a one-off colour outside the semantic set, **add the token to `globals.css` first**, then use the new utility.

### 3.2 Icons only from `#/icons`

No `import { X } from "lucide-react"` anywhere outside `apps/admin/src/icons/`. Enforced by Biome's `noRestrictedImports` (at `warn` today; flips to `error` after the call-site sweep in prompt `02`). See [`../icons/README.md`](../icons/README.md).

### 3.3 RTL via logical properties

Every primitive uses logical Tailwind utilities: `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`, `border-s`, `border-e`, `inset-inline-start`, `inset-inline-end`. Forbidden: `ml-*`, `mr-*`, `pl-*`, `pr-*`, `text-left`, `text-right`, `left-*`, `right-*` — except inside `<svg>` markup. Where RTL needs an icon to flip (chevrons, arrows), use the directional icon from `#/icons`.

### 3.4 Variants via `tv()`

All primitive variant surfaces use `tailwind-variants`. `cva` is forbidden in tier 2/3/4. Inline lookup objects (`const VARIANT = { primary: "..." }`) are forbidden. Compound primitives with multiple slots use `tv({ slots })`. Prompt `02` migrates the two existing `cva` usages (`button`, `badge`) to `tv()`.

### 3.5 Floating contract

Every floating surface (dropdown, popover, dialog, sheet, tooltip, combobox popup) uses Base UI's `Portal` + `Positioner` (or `Backdrop` + `Popup` for modals) and `collisionPadding={8}` minimum. Width caps with `min(NUMrem, calc(100vw - 2rem))`; height caps with `min(NUMrem, NUMvh)`. Animations honour `motion-reduce:transition-none`.

### 3.6 `data-slot="<name>"` on every primitive root

Stable selectors for tests and downstream tweaks.

### 3.7 Loading / Empty / Error trio

Every async-aware primitive distinguishes three terminal states. Loading shows `Spinner`/`Skeleton`; Empty shows `EmptyState` after the promise resolves with zero rows; Error shows an inline block with a Retry affordance. **Never show Empty mid-flight** — that's the canonical bug where the user types one character and sees "no results" because the empty state rendered before the search resolved.

### 3.8 Calendar-in-Dialog only

Every date input flow in the admin opens a Calendar **inside a Dialog**, never inside a Popover. Single canonical primitives: `DatePickerField` (single date) and `DateRangePickerField` (range). Owned by prompt `03`.

### 3.9 All Comboboxes feel the same

Single-select → `Combobox`. Multi-select → `MultiCombobox`. Async + entity-shaped (id + label + sublabel + image) → `EntityCombobox`. Business pickers (`ProductPicker`, `CategoryPicker`, …) wrap `EntityCombobox` — never roll their own popup. The "do not pass `items` to `Combobox.Root` when the parent owns search" rule is documented in `EntityCombobox/README.md` (prompt `05`).

### 3.10 All Buttons feel the same

One `Button` primitive. Variants: `default`, `secondary`, `outline`, `ghost`, `link`, `destructive`. Tones (compound variant): `default`, `success`, `warning`, `danger`. Sizes: `xs`, `sm`, `md` (default), `lg`, `icon`. Loading via `isLoading` prop (keeps width, swaps children for `<Spinner />`, sets `aria-busy`, disables pointer events). `asChild` via Radix Slot for polymorphism. **All callers use this `Button`** — no inline `<button class="px-2 py-1 …">` in views.

### 3.11 No `useEffect` for derived state

State derived from props/other state is computed inline or with `useMemo` — never via `useEffect(() => setLocal(derived(props)), [props])`. Legitimate `useEffect` cases: async side effects (fetch, debounced search, subscription), DOM measurement, third-party imperative APIs. The "settle-then-persist" pattern uses a timer ref + cleanup, not a derived-state effect.

### 3.12 No domain logic in tier 2/3

A primitive cannot import from `#/lib/queries/`, `#/lib/server-repos`, or any view. If a primitive seems to need this, it's a tier-4 business primitive.

### 3.13 Format helpers via `#/lib/format`

Money → `formatMoney`; dates → `formatDate`/`formatDateTime`; numbers → `formatNumber`; percent → `formatPercent`. Forbidden: raw `Intl.NumberFormat` / `Intl.DateTimeFormat` calls in view or primitive code.

---

## 4. Token reference

### Status accent tokens (the most-used semantic surface)

| Utility | Light value | Dark value |
|--- |--- |--- |
| `bg-success` / `text-success` | hsl(152 64% 38%) — emerald | hsl(152 60% 50%) — emerald, brightened |
| `text-success-foreground` | white | near-black |
| `bg-warning` / `text-warning` | hsl(35 92% 50%) — amber | hsl(35 92% 60%) — amber, brightened |
| `text-warning-foreground` | near-black | near-black |
| `bg-danger` / `text-danger` | hsl(0 84% 60%) — rose | hsl(0 72% 55%) — rose, dimmed for dark |
| `text-danger-foreground` | white | white |
| `bg-info` / `text-info` | hsl(210 95% 55%) — sky | hsl(210 95% 65%) — sky, brightened |
| `text-info-foreground` | white | near-black |
| `bg-destructive` | (alias of danger) | (alias of danger) |
| `text-destructive-foreground` | white | white |

### Surface tokens

| Utility | Resolves to |
|--- |--- |
| `bg-background` | page background (off-white light / deep-cool dark) |
| `text-foreground` | body text (near-black light / near-white dark) |
| `bg-card` | card surface (slightly elevated) |
| `text-card-foreground` | body text on a card |
| `bg-popover` | floating popover surface (a step above card) |
| `text-popover-foreground` | body text on a popover |
| `bg-muted` | inactive / secondary surface |
| `text-muted-foreground` | secondary text |
| `bg-accent` | hover surface |
| `text-accent-foreground` | text on a hover surface |
| `bg-primary` | brand action (indigo-violet 232 60% 60%) |
| `text-primary-foreground` | white text on primary |
| `bg-secondary` | neutral action |
| `text-secondary-foreground` | body text on secondary |

### Lines + rings

| Utility | Resolves to |
|--- |--- |
| `border-border` | the universal divider colour |
| `border-input` | form-control border |
| `ring-ring` | focus ring (brand-coloured) |

### Sidebar (admin chrome)

`bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-primary`, `bg-sidebar-accent`, `border-sidebar-border`, `ring-sidebar-ring`.

### Charts

`stroke-chart-1`, `fill-chart-1` through `chart-5`.

---

## 5. Icons reference

### Pass-through icons

Every name from [lucide.dev/icons](https://lucide.dev/icons) used in the admin is re-exported from `#/icons`. Import by name:

```tsx
import { Search, Trash2, Plus, Check, Pencil } from "#/icons";
```

### Logical (RTL-aware) directional icons

| Name | Renders | Flips under RTL? | Use for |
|--- |--- |--- |--- |
| `ChevronStart` | `<ChevronLeft data-rtl-flip />` | yes | back, previous, collapse |
| `ChevronEnd` | `<ChevronRight data-rtl-flip />` | yes | forward, next, expand |
| `ArrowStart` | `<ArrowLeft data-rtl-flip />` | yes | back, return |
| `ArrowEnd` | `<ArrowRight data-rtl-flip />` | yes | forward, continue |
| `ChevronsStart` | `<ChevronsLeft data-rtl-flip />` | yes | jump-to-first-page |
| `ChevronsEnd` | `<ChevronsRight data-rtl-flip />` | yes | jump-to-last-page |

If you need a chevron / arrow that **doesn't** flip (e.g. inside a fixed-orientation diagram), import the raw `ChevronLeft` / `ChevronRight` / `ArrowLeft` / `ArrowRight` from `#/icons` directly.

### Loading

`Spinner` is an alias for `Loader2`. Use `<Spinner />` consistently.

---

## 6. The file template

Every primitive folder starts from this template. Adjust per primitive — but the shape stays.

```tsx
// <name>/<name>.variants.ts
import { tv, type VariantProps } from "tailwind-variants";

export const componentName = tv({
    base: "base classes shared by every variant",
    variants: {
        variant: { default: "...", outline: "..." },
        size: { sm: "...", md: "...", lg: "..." },
    },
    compoundVariants: [{ variant: "outline", size: "sm", class: "..." }],
    defaultVariants: { variant: "default", size: "md" },
});

export type ComponentNameVariants = VariantProps<typeof componentName>;
```

```tsx
// <name>/<name>.parts.tsx
"use client"; // or omit when the primitive is server-safe

import { ComponentName as BaseComponentName } from "@base-ui/react/component-name";
import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

import { type ComponentNameVariants, componentName } from "./component-name.variants";

export interface ComponentNameRootProps
    extends ComponentProps<typeof BaseComponentName.Root>,
        ComponentNameVariants {
    asChild?: boolean;
}

/** First sentence is the contract. Rest is rationale + edge cases. Flows to the showcase props table. */
export function ComponentNameRoot({ className, variant, size, ...props }: ComponentNameRootProps) {
    return (
        <BaseComponentName.Root
            data-slot="component-name"
            className={componentName({ variant, size, class: className })}
            {...props}
        />
    );
}
ComponentNameRoot.displayName = "ComponentNameRoot";

// …additional subparts (Trigger, Content, Header, Body, Footer, etc.)
```

```tsx
// <name>/index.tsx
"use client";
import type { ReactNode } from "react";
import { ComponentNameRoot, /* …subparts */ } from "./component-name.parts";

export interface ComponentNameProps {
    /** JSDoc on every exported prop. */
    title?: ReactNode;
    children: ReactNode;
}

/**
 * Convenience wrapper — the 90% case in one line. For headless usage, reach for the compound
 * subparts (`ComponentNameRoot`, …) re-exported below.
 */
export function ComponentName({ title, children }: ComponentNameProps) {
    return (
        <ComponentNameRoot>
            {title}
            {children}
        </ComponentNameRoot>
    );
}
ComponentName.displayName = "ComponentName";

export { ComponentNameRoot /*, …subparts */ };
```

Compound primitives (Card, Field, EmptyState) use `tv({ slots })` and destructure the resolved slot functions per render. The slot result is callable so call-site overrides compose cleanly: `<div className={root({ class: className })}>`. No `cn()` wrap needed when only the slot is involved.

---

## 7. How to add a new primitive

1. Pick the tier. Pure visual / behavioural → tier 2. Built from tier-2 + structural → tier 3. Wired to a query hook → tier 4.
2. Scaffold the folder under `components/ui/<name>/` (tier 2/3) or `components/business/<name>/` (tier 4):
   ```
   <name>/
   ├── index.tsx
   ├── <name>.parts.tsx
   ├── <name>.variants.ts
   ├── <name>.demo.tsx
   └── README.md
   ```
3. Write `variants.ts` first — defines the variant surface using `tv()`.
4. Write `parts.tsx` — wraps the underlying Base UI part(s), applies tokens, sets `data-slot`.
5. Write `index.tsx` — the convenience wrapper on top of the parts. Re-export every part by name.
6. Write `README.md` — when to use, when not to use, props summary, a11y notes, keyboard shortcuts.
7. Write `<name>.demo.tsx` — exports `Variants`, `States`, `AsyncSurface` (if async-aware), `Code`, `PropsTable`, `AccessibilityNotes`, `EdgeCases`. The showcase page consumes these.

## 8. How to add a new business primitive

Same shape as above, plus:

1. Add the query/mutation hook to `#/lib/queries/<resource>.ts` first if it doesn't exist.
2. The primitive imports the hook and maps the API shape to whatever shape the underlying UI primitive expects.
3. The primitive owns ZERO state that the query layer doesn't already own — no parallel cache, no `useEffect`-based fetch.
4. Add the locale-aware labels via `useTranslations` from `next-intl`. Never inline string literals.
5. The `*.demo.tsx` uses the mock fixtures from `#/design-system/lab/mock` (latency helpers + fixture lists) — never wires the demo to live API.

---

## 9. What is enforced (and where)

| Rule | Enforcer | Status today |
|--- |--- |--- |
| No raw lucide-react imports outside `#/icons` | Biome `noRestrictedImports` | `warn` — flips to `error` after the prompt 02–05 sweep |
| No raw Tailwind colour utilities | `scripts/lint-tokens.mjs` | `warn` — flips to `error` after prompt `06` |
| Import sort | Biome `assist.actions.source.organizeImports` | `on` |
| `useExportType` | Biome `style.useExportType` | `error` |
| Next.js + React rule sets | Biome `domains.next: all` / `react: all` | `recommended/all` |

Run all checks: `pnpm lint` from the repo root.
