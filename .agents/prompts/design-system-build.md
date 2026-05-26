# Build the Calibra Admin Design System

> **How to use this prompt**: Paste the body (everything below the `---` separator) as the first user turn in a fresh Claude Code session. The agent will read the listed files, surface the open questions, and wait for your answers before writing code.
>
> _Last refreshed: 2026-05-26 — keep this file in `.agents/prompts/` so edits land alongside code._

---

You're starting a multi-session effort to rebuild the admin panel's UI primitive layer as a real, cohesive design system on top of Base UI. This session is **build-only** — implement the design system in isolation. Do **not** touch any existing app code under `apps/admin/src/app/`, `apps/admin/src/views/`, or `apps/admin/src/lib/` other than reading them for reference. A separate session will migrate existing call sites to the new system.

The current state: the admin has ~30 ad-hoc primitives under `apps/admin/src/components/ui/`. Some are well-built (the recent `Sheet` is the bar — read its source first), some are thin wrappers, some predate the Base UI migration. They're inconsistent in API shape, token usage, RTL handling, and quality. The goal here is to build the canonical replacement: token system, every primitive, a live showcase site with Shiki-rendered code samples, and a CONTRIBUTING-style doc.

## Read these first, in order

1. `apps/admin/AGENTS.md` — admin app conventions (shadcn New York, path alias `#/*`, locale-aware `Link`, RTL flips, etc.).
2. `apps/admin/src/components/ui/sheet.tsx` — **this is the bar.** Mirror its quality, structure, token usage, RTL handling, and comment density across the whole system.
3. `apps/admin/src/components/ui/popover.tsx` — minimal good wrapper. Note: `Portal` + `Positioner` + `Popup`, opt-in `collisionPadding`, `data-slot` attribute.
4. `apps/admin/src/styles/globals.css` — current Tailwind v4 + shadcn HSL token set. The new system extends this; do not rip it out.
5. `apps/admin/components.json` — shadcn CLI config. Keep `cn` sourced from `@calibra/shared`.
6. `pnpm-workspace.yaml` — confirm catalog deps. **Do not add new dependencies without explicit user approval.** `@base-ui/react`, `lucide-react`, `tailwindcss`, `@tailwindcss/postcss`, `class-variance-authority`, `tailwind-merge` are all in the catalog.

If a referenced file doesn't exist, search before assuming a layout — the worktree may have evolved.

## Mission

Build a design system named `@calibra-admin/ds` *in place* (single app, not extracted) at:

```
apps/admin/src/design-system/
├── DESIGN_SYSTEM.md         # canonical doc — read by humans and future agents
├── tokens/
│   ├── colors.css           # @theme color tokens (semantic + raw)
│   ├── typography.css       # font scale, weights, line-heights
│   ├── spacing.css          # spacing scale + radius scale
│   ├── shadows.css          # elevation scale
│   ├── motion.css           # duration + easing tokens
│   ├── z-index.css          # layer scale
│   └── index.css            # @imports the above
├── primitives/              # one file per primitive (PascalCase.tsx)
├── lab/                     # opt-in helpers used only by the showcase (CodeBlock, etc.)
└── index.ts                 # public export surface
```

And a showcase site at:

```
apps/admin/src/app/[locale]/(authenticated)/dev/ds/
├── layout.tsx               # design-system shell with side nav of primitives
├── page.tsx                 # landing — design tokens preview + primitive index
└── [primitive]/page.tsx     # one route per primitive, dynamic
```

The showcase route is **gated** behind `process.env.NODE_ENV !== "production"` so it never ships to the live admin. Place the gate in the layout. In dev, link to it from the existing topbar under a small "DS" affordance — but **don't touch** any other navigation file beyond adding a single dev-only link.

## Tech stack constraints (non-negotiable)

- **Base UI as the source of truth.** Every primitive that has a Base UI equivalent must wrap Base UI parts. Don't use Radix; don't roll your own focus-trap / floating positioner.
- **Tailwind v4 only.** No CSS-in-JS, no Stylex. Use `@theme` directive for tokens, logical utilities for layout.
- **RTL-first.** Logical properties everywhere: `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`, `inset-inline-start-*`, `inset-inline-end-*`, `border-s`, `border-e`. No `ml-*`, `mr-*`, `text-left`, `text-right`, `left-*`, `right-*` in the new system.
- **TypeScript strict.** Every primitive exports its props interface. Use `React.ComponentProps<T>` to extend the underlying Base UI part.
- **`cn()` for class merging.** Always import from `#/lib/utils` (re-exports from `@calibra/shared`).
- **`tv()` from `tailwind-variants` for every variant API.** Not CVA, not lookup objects, not `clsx` chains. `tv()` gives us slot composition, compound variants, variant extension via `tv.extend`, and built-in `twMerge` — all the things a real design system needs. If `tailwind-variants` isn't already in `pnpm-workspace.yaml#catalogs.default`, surface that as the third open question before writing code.
- **`data-slot="<primitive-name>"`** on the root element of every primitive so downstream code can hang stable selectors.
- **`displayName` set** for every component (DevTools + downstream tooling).
- **No new deps without approval.** Shiki is the one exception — see the showcase section below. Confirm `shiki` is in catalog before importing; if not, add it to `pnpm-workspace.yaml#catalogs.default` and confirm.

## Token system

Tokens live in CSS, are exposed via `@theme` so Tailwind utilities pick them up automatically, and have a strict naming scheme. The system has two levels: **raw** (the actual values, e.g. `--ds-blue-500`) and **semantic** (the meaning, e.g. `--ds-color-primary`). All code uses semantic tokens; raw tokens are only referenced inside `tokens/`.

### Color scale (HSL, light + dark)

For every hue: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950.

Hues to define:
- `neutral` (cool grey, the base UI palette)
- `primary` (brand — pick a sane blue/indigo unless the existing globals.css already has a brand; preserve it)
- `success` (emerald)
- `warning` (amber)
- `danger` (rose)
- `info` (sky)

Semantic mapping (the only tokens components reference):
- `--ds-color-background`, `--ds-color-foreground`
- `--ds-color-muted`, `--ds-color-muted-foreground`
- `--ds-color-card`, `--ds-color-card-foreground`
- `--ds-color-popover`, `--ds-color-popover-foreground`
- `--ds-color-primary`, `--ds-color-primary-foreground`
- `--ds-color-secondary`, `--ds-color-secondary-foreground`
- `--ds-color-accent`, `--ds-color-accent-foreground`
- `--ds-color-destructive`, `--ds-color-destructive-foreground`
- `--ds-color-success`, `--ds-color-success-foreground`
- `--ds-color-warning`, `--ds-color-warning-foreground`
- `--ds-color-border`, `--ds-color-input`, `--ds-color-ring`

Define each under both `:root` (light) and `.dark` (dark mode toggled via `.dark` class on `<html>`).

### Typography

- Font families: `--ds-font-sans`, `--ds-font-mono`. Default `sans` to the existing admin font stack (probably IRANSans / Vazir / system-ui — read globals.css). Mono to JetBrains Mono / ui-monospace.
- Type scale (rem): xs 0.75, sm 0.875, base 1, lg 1.125, xl 1.25, 2xl 1.5, 3xl 1.875, 4xl 2.25, 5xl 3, 6xl 3.75.
- Line-heights paired with each size — slightly tighter than Tailwind defaults for the dense admin chrome.
- Weights: 400/500/600/700. No 100/200/300/800/900 unless the font file ships them.

### Spacing + radius

- Spacing: keep Tailwind's 0..96 scale, no overrides — but document the *intended* spacing rhythm: 1 (4px) for inline, 2 (8px) for tight, 3 (12px) for default, 4 (16px) for card padding, 6 (24px) for section gap.
- Radius: `--ds-radius-xs 2px`, `sm 4px`, `md 6px`, `lg 8px`, `xl 12px`, `2xl 16px`, `full 9999px`.

### Shadows (elevation)

`--ds-shadow-xs` through `--ds-shadow-2xl`. Five-step scale. Use the existing shadcn shadow tokens as a starting point; the design system just consolidates them under DS-prefixed names.

### Motion

- Durations: `--ds-duration-fast 120ms`, `--ds-duration-default 180ms`, `--ds-duration-slow 280ms`.
- Easings: `--ds-ease-default cubic-bezier(0.16, 1, 0.3, 1)`, `--ds-ease-out cubic-bezier(0, 0, 0.2, 1)`, `--ds-ease-in cubic-bezier(0.4, 0, 1, 1)`.
- Components honor `prefers-reduced-motion` via `motion-reduce:transition-none`.

### Z-index scale

- `--ds-z-base 0`, `dropdown 20`, `sticky 30`, `overlay 40`, `dialog 50`, `popover 60`, `toast 70`, `tooltip 80`.

## Primitives to build

For each, build the Base UI wrapper, write the showcase page entry, and add the JSDoc-driven props doc. Group by category in the side nav.

Required props every interactive primitive supports (when applicable): `disabled`, `aria-label` / `aria-labelledby`, full keyboard navigation, focus-visible ring using `--ds-color-ring`, controlled + uncontrolled state.

**DatePicker and TimePicker are explicitly out of scope** — a separate PR owns the date-input surface (Jalali-aware calendar, locale-routed digit rendering, etc.). Do not build them here, do not stub them, do not add a placeholder showcase page. The migration session will wire whatever that PR ships into the form primitives independently.

### Layout / structure

| Primitive | Base UI part | Notes |
|---|---|---|
| `Box` | none (`div`) | Polymorphic via `asChild`. Token-aware spacing/radius props. |
| `Stack` | none | `direction` (row/column), `gap`, `align`, `justify`, `wrap`. Logical `start`/`end` only. |
| `Card` | none | Compound: `Card.Root`, `Card.Header`, `Card.Title`, `Card.Description`, `Card.Body`, `Card.Footer`. |
| `Separator` | `Separator` | Horizontal + vertical, with optional `label`. |
| `AspectRatio` | none | Plain CSS aspect-ratio wrapper. |
| `ScrollArea` | `ScrollArea` | Custom scrollbar styling, RTL-flip aware. |
| `Sheet` | `Dialog` (Base UI) | Side-mounted dialog. Sides: `start` (inline-start), `end`, `top`, `bottom`. **The reference implementation lives at `apps/admin/src/components/ui/sheet.tsx` — port verbatim, only adjust to the new token names.** |
| `Dialog` | `Dialog` | Centered. Compound with `Trigger`, `Content`, `Header`, `Title`, `Description`, `Footer`, `Close`. |
| `Drawer` | `Dialog` | Mobile-first bottom-sheet drawer with drag-to-dismiss. |
| `Popover` | `Popover` | Already the bar — port + polish. |
| `Tooltip` | `Tooltip` | Single-tooltip and `Tooltip.Provider` for grouped delay. |
| `HoverCard` | `PreviewCard` | Hover-reveal rich content. |

### Inputs

| Primitive | Base UI part | Notes |
|---|---|---|
| `Button` | none | Variants: `default`, `outline`, `ghost`, `secondary`, `destructive`, `link`. Sizes: `xs`, `sm`, `md`, `lg`, `icon`. Loading state (replaces children with spinner + keeps width). `asChild` via Radix Slot. |
| `IconButton` | none | Button with strict aspect-ratio + tooltip integration. |
| `ToggleButton` | `Toggle` | Single binary toggle. |
| `ToggleGroup` | `ToggleGroup` | Single + multiple modes. |
| `Input` | `Input` | With `prefix`, `suffix` slots; error / helper text props; clearable variant. |
| `Textarea` | none (`textarea`) | Auto-resize variant via `field-sizing: content` (CSS) with JS fallback. |
| `NumberField` | `NumberField` | With steppers, locale-aware digit rendering (fa-IR digits when `locale=fa`). |
| `Checkbox` | `Checkbox` | Indeterminate state, label slot. |
| `CheckboxGroup` | `CheckboxGroup` | With shared name + validation. |
| `RadioGroup` | `RadioGroup` | Horizontal + vertical layouts. |
| `Switch` | `Switch` | With `label` and `description` props. |
| `Select` | `Select` | Single-select. Wraps the existing one if it's already good. |
| `Combobox` | `Combobox` | Single-select autocomplete. |
| `MultiCombobox` | `Combobox` (multi) | Server-side async filtering: render items directly from the parent's resolved list — **do not pass `items` to `Combobox.Root`** or Base UI's local filter will run on top of yours and the result will look broken (typing gibberish still shows all items). The parent owns selection state too; don't use Combobox's internal value. |
| `Slider` | `Slider` | Single + range thumbs. |
| `Label` | none | With `required` and `optional` markers. |
| `Field` | `Field` | Bundles label + control + error + helper into one block. |
| `Fieldset` | `Fieldset` | Group of fields. |
| `Form` | `Form` | RHF-compatible wrapper. |

### Feedback / status

| Primitive | Base UI part | Notes |
|---|---|---|
| `Badge` | none | Variants: `default`, `secondary`, `outline`, `success`, `warning`, `destructive`. Dot variant. |
| `Alert` | none | Variants by tone, with `title` and `description`. |
| `Toast` | `Toast` | Provider + `toast.add()` API. |
| `Progress` | `Progress` | Determinate + indeterminate. |
| `Meter` | `Meter` | For percent-of-range values (e.g. usage limits). |
| `Spinner` | none | Sizes `xs..xl`. |
| `Skeleton` | none | Shimmer + pulse modes. |
| `EmptyState` | composition | Compound: `EmptyState.Root`, `Icon`, `Title`, `Description`, `Actions`. |

### Navigation

| Primitive | Base UI part | Notes |
|---|---|---|
| `Tabs` | `Tabs` | `variant`: `line`, `pills`, `solid`. Indicator animation. |
| `Accordion` | `Accordion` | Single + multiple. |
| `Collapsible` | `Collapsible` | Single section. |
| `DropdownMenu` | `Menu` | With `Item`, `Separator`, `Group`, `Label`, `Sub`, `CheckboxItem`, `RadioItem`. |
| `ContextMenu` | `ContextMenu` | Right-click menu. |
| `Menubar` | `Menubar` | App-bar menus. |
| `NavigationMenu` | `NavigationMenu` | Mega-menu style. |
| `Toolbar` | `Toolbar` | Action bar wrapper. |
| `Breadcrumb` | composition | With `Item`, `Separator`. |
| `Pagination` | composition | Numbered + prev/next + page-size. |

### Data display

| Primitive | Base UI part | Notes |
|---|---|---|
| `Avatar` | `Avatar` | With fallback initials, status dot, image. |
| `AvatarGroup` | composition | Overlap + overflow count. |
| `Kbd` | none | Inline keyboard key visual. |
| `Code` | none | Inline code style. |
| `CodeBlock` | composition | Shiki-rendered. Server component when possible. Props: `code`, `language`, `theme`, `lineNumbers?`, `highlight?`, `copy?`. |
| `DescriptionList` | composition | `DList.Root`, `Term`, `Description`. |

## Showcase site spec

Route base: `/[locale]/(authenticated)/dev/ds`. Gate the layout with `if (process.env.NODE_ENV === "production") notFound();` from `next/navigation` so it never ships.

### Landing page (`/dev/ds`)

- Heading + brief intro.
- **Token preview blocks**: a row per token category (colors, typography, spacing, radius, shadows). Each row renders every token as a swatch + the CSS variable name + the value resolved at runtime via `getComputedStyle(document.documentElement).getPropertyValue(...)` (client component for live values).
- **Primitive index**: alphabetized list of every primitive with a one-line description, linking to its dedicated page.

### Per-primitive page (`/dev/ds/[primitive]`)

Each page is a server component that imports the primitive and renders a structured demo:

1. **Title + description** (sourced from a shared `PRIMITIVES_META` registry).
2. **Variants section** — every visual + behavioural variant rendered side by side in a `Card`. Hover/focus/disabled states each get their own labeled example.
3. **States section** — error, loading, empty, RTL toggle, dark/light toggle (the toggle re-keys the demo by setting `dir`/`class` on a local wrapper element, not the root html).
4. **Code samples** — for every variant, a Shiki-rendered code block showing the exact JSX. The string source for each demo lives next to the component as `*.demo.tsx` files OR inline in a `<CodeBlock code={...} language="tsx" />`. Pick whichever is easier to read; consistency matters more than cleverness.
5. **Props table** — auto-generated from the primitive's TypeScript interface if you can (use `react-docgen-typescript` only if it's already in catalog; otherwise hand-author the table from the JSDoc).
6. **Accessibility notes** — keyboard shortcuts, ARIA roles, focus management.
7. **Edge cases gallery** — overflow text, empty state, very long lists, nested usage.

### Shiki integration

- Use `shiki` v1+ (`createHighlighter` / `codeToHtml`).
- Provide a `<CodeBlock>` server component that renders highlighted HTML at request time. Don't expose Shiki to the client bundle.
- Themes: light + dark from the `vesper` family or `github-light` / `github-dark` — pick one pair and stay consistent.
- Languages registered: `tsx`, `ts`, `bash`, `json`, `css`, `html`, `md`.
- Add a "copy" button that uses `navigator.clipboard.writeText()` (client wrapper component around the server-rendered HTML).
- The CodeBlock component is part of the design system (`design-system/primitives/CodeBlock.tsx`), not the showcase glue — other primitives can reach for it.

### Navigation shell

A vertical side nav in `layout.tsx`:
- Section headers: **Tokens**, **Layout**, **Inputs**, **Feedback**, **Navigation**, **Data**.
- Each list item linking to the matching `/dev/ds/[primitive]` route.
- Active route highlighted via `usePathname()` + `cn()`.
- A theme toggle (light/dark) and a direction toggle (LTR/RTL) at the top — these only affect the showcase content, not the wider admin shell.

## Async + loading state is a first-class concern

The admin is mostly an async surface — forms post mutations, lists fetch pages, comboboxes filter against the server, dialogs open against data that hasn't arrived yet. Loading state is not a checkbox you tick once; **every primitive that can sit on top of an async operation must expose a loading-state contract** and the showcase must demonstrate it.

### The contract per primitive

| Primitive | Loading-state contract |
|---|---|
| `Button`, `IconButton`, `ToggleButton` | `isLoading` prop. While true, the button keeps its width, replaces children with a centered `Spinner`, sets `aria-busy`, and disables pointer events. |
| `Combobox`, `MultiCombobox` | While the parent's `onSearch` promise is in-flight, the popup shows a top-right `Spinner` next to the search input and an aria-live "loading" hint. The `Empty` slot only renders after the promise resolves with zero rows — never mid-flight. |
| `Select` | `loading` prop on the trigger renders the placeholder + inline `Spinner`; the popup, when opened during load, shows a skeleton row list. |
| `Dialog`, `Sheet`, `Drawer` | Accept an `isLoading` prop. When true, the body renders a `Skeleton` block + the action buttons in their loading state — header and footer chrome still render so the open animation isn't visually replaced by a flash of empty content. |
| `Card` | `isLoading` prop swaps the body for a `Skeleton` block sized to the card's typical content. Header + footer keep rendering. |
| `Table` (when DS-built; today owned by `data-table`) | `isLoading` prop swaps the body for `N` skeleton rows that match the column widths. |
| `Avatar` | While the image is loading, shows the fallback (initials or icon) — never a flash of nothing. |
| `Form` / `Field` | The `Form` provider exposes `isPending` for the active submit; `Field` renders an inline `Spinner` next to the label of any control with a pending controlled async validator. |
| `Tabs`, `Accordion` | Per-panel `isLoading` so the panel body shows a `Skeleton` block while its data is fetching, instead of collapsing the panel height. |
| `Toast` | A `toast.promise(promise, { loading, success, error })` API. The loading toast renders a `Spinner` and an aria-live "polite" status; auto-replaces with success / error on settle. |
| `Pagination` | While the page is fetching, the prev/next buttons disable and show inline `Spinner`s; the page number text dims to `text-muted-foreground`. |

### Loading vs empty vs error — three different states

Every async-aware primitive distinguishes three terminal states. The showcase must demo all three side by side:

- **Loading**: the promise hasn't settled. Show `Spinner` / `Skeleton`. Never show `Empty` here — that's a common bug where the user types one character and sees "no results" because the empty state rendered before the search resolved.
- **Empty**: the promise settled successfully but returned zero rows / nothing to display. Show `EmptyState` with a friendly message and a clear next action.
- **Error**: the promise rejected. Show an inline error block with a Retry affordance. For dialogs / sheets, render the error inside the body — never block the close action.

A primitive that ships with only one of these states is incomplete.

### Showcase mock data — required, realistic, configurable

Every showcase page for an async-aware primitive **must** include a mock-data demo. Build a tiny mock toolkit under `apps/admin/src/design-system/lab/mock/` with:

- `delay(ms)` — a `Promise<void>` that resolves after `ms`. Default to `400ms` so the loader is visible without being annoying.
- `withLatency<T>(value: T, ms?: number)` — wraps any value in a promise that resolves after `ms`. Default `400ms`.
- `withRandomLatency<T>(value: T, [min, max])` — randomized so the operator feels real network jitter.
- `withFailure<T>(value: T, rate: number)` — Promise that rejects `rate * 100%` of the time. Used by the error-state demo.
- `mockProducts`, `mockCategories`, `mockBrands`, `mockCustomers`, `mockOrders` — realistic fixture lists (~50 rows each) with believable Persian + English names, SKUs, and money values. Pulled into Combobox / Select demos.
- Per-primitive demo controls (a small panel above each demo) to toggle: `loading` / `error` / `empty` / `latency=fast|slow|jitter`. Wired via local `useState` so the showcase operator can flip between states without reloading.

Concretely, the Combobox showcase page must render at least these demos:

1. **Idle** — popup closed, no data loaded.
2. **Loading on first open** — `onSearch` returns `withLatency(mockProducts.slice(0, 10), 800)`. The popup opens, shows a skeleton list with a spinner; after 800ms the rows render in.
3. **Mid-search loading** — typing in the input shows the spinner next to the search field while the per-keystroke promise resolves.
4. **Empty after settle** — search query is "zzzz". `onSearch` returns `withLatency([], 400)`. After resolve, the `Empty` slot renders.
5. **Error then retry** — search query that triggers `withFailure(mockProducts, 1)`. The popup shows an inline error with a Retry button that re-runs the search.
6. **Slow network jitter** — `withRandomLatency(mockProducts, [200, 1800])` so the operator can feel what real network variance looks like.

Same shape for the Sheet / Dialog showcase ("opened with no data → renders skeleton → data arrives"), the Card showcase, the Table-equivalent if any, etc.

### Why this matters

Loaders are routinely the first thing AI agents skip when building a primitive. The fastest, cheapest path is "happy-path data is always present" — and the result ships as soon as a real backend request takes 200ms. Every primitive that omits loading state becomes a future bug. We're paying down that debt up-front by:

1. Making the loading-state contract part of the primitive API (not a wrapper concern).
2. Forcing every showcase page to demonstrate the loading / empty / error trio with realistic mock data.
3. Documenting the three states explicitly in `DESIGN_SYSTEM.md` so future agents reach for them before re-rolling another bespoke spinner.

## Engineering principles (the quality bar)

Mirror the quality of `apps/admin/src/components/ui/sheet.tsx`. Specifically:

- **Portal everything that floats.** Popover, dropdown, dialog, tooltip, sheet — all use Base UI's `*.Portal` so they lift above any parent overflow.
- **Collision detection.** Every floating surface uses `Positioner` with explicit `collisionPadding` (default 8px, callers can opt up).
- **Truncate long text.** Any list-row primitive (`MenuItem`, `ComboboxItem`, `SelectItem`) uses `min-w-0 truncate` on text content so overflow is visual, not horizontal.
- **Bounded dimensions.** Floating popups cap width with `min(NUMrem, calc(100vw - 2rem))` and scroll areas cap height with `min(NUMrem, NUMvh)`.
- **Animations honor reduced motion.** `motion-reduce:transition-none` on every animated state.
- **Backdrop blur** uses `backdrop-blur supports-[backdrop-filter]:bg-*/70` patterns so non-supporting browsers fall back to opaque.
- **Focus rings** use `focus-visible:ring-[3px] focus-visible:ring-ring/50` consistently. Never plain `:focus` rings.
- **Keyboard semantics.** Test every interactive primitive with Tab / Shift+Tab / Arrow keys / Enter / Space / Escape. Document the bindings in the primitive's JSDoc + showcase page.
- **No `console.log`, no `any`.** TypeScript strict; tests are not required this session but typecheck must pass.
- **Comments** follow the project's polish-comments rule: JSDoc on exported symbols where the WHY isn't obvious; no inline `//` for trivial code; lead with what the contract guarantees.

## API conventions

- **Compound components** for multi-part primitives. Default export is the root; subparts hang off via namespaced exports:
  ```tsx
  export { Card, CardHeader, CardTitle, CardDescription, CardBody, CardFooter };
  ```
  Don't use static properties on the root (`Card.Header`) — they break tree-shaking in Next.js server components.
- **Polymorphism** via `asChild` (Slot pattern). Most Base UI parts already accept a `render` prop — expose it as `asChild` to match shadcn idioms callers already know.
- **Controlled + uncontrolled** for any stateful primitive (`open` + `defaultOpen`, `value` + `defaultValue`). Use `useControllableState` from a Base UI utility if available, otherwise hand-roll.
- **Variants via `tv()`** from `tailwind-variants`. Use `slots` for compound primitives (a Card with header + body + footer is one `tv` call, not three), `compoundVariants` for tone × size matrices, and `extend` for primitive families that share a base (`Button` → `IconButton`). Don't ship lookup objects (`const variantClasses = { primary: "..." }`) — they break Tailwind's class extraction and lose `twMerge` semantics. Never call `cva` in the new system; the existing CVA usages in the old `components/ui/` will be migrated in a separate session.
- **No prop drilling for theme**. Primitives never accept `theme` props; everything reads from CSS variables.
- **Server-side filtering for async lists.** Comboboxes / autocompletes that hit a backend filter via a search query MUST disable Base UI's local filter. Concretely: do not pass `items` to `Combobox.Root` when the parent loads results via `onSearch(query)`. Render `Combobox.Item` children directly from the resolved list. The user can otherwise type gibberish and still see every option because Base UI ran a second filter pass against an already-filtered list.

## File template

Each primitive file follows this shape:

```tsx
"use client"; // or omit when the primitive is server-safe

import { ComponentName as BaseComponentName } from "@base-ui/react/component-name";
import * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";

import { cn } from "#/lib/utils";

/* ─────────────────────────── Variants ─────────────────────────── */

/**
 * For a single-slot primitive, `tv()` returns a function that takes variant props and
 * resolves to a single className string. For compound primitives, use the `slots` form
 * (commented below) — one `tv` call covers every part.
 */
const componentName = tv({
    base: "base classes shared by every variant",
    variants: {
        variant: {
            default: "...",
            outline: "...",
        },
        size: {
            sm: "...",
            md: "...",
            lg: "...",
        },
    },
    compoundVariants: [
        { variant: "outline", size: "sm", class: "..." },
    ],
    defaultVariants: { variant: "default", size: "md" },
});

/* Compound-primitive shape (Card / DescriptionList / EmptyState / Field etc.):
 *
 * const card = tv({
 *     slots: {
 *         root: "rounded-lg border border-border bg-card",
 *         header: "border-b border-border px-4 py-3",
 *         title:  "font-semibold text-base",
 *         body:   "p-4",
 *         footer: "border-t border-border px-4 py-3",
 *     },
 *     variants: {
 *         tone: {
 *             default:    {},
 *             destructive:{ root: "border-destructive/40", title: "text-destructive" },
 *         },
 *     },
 *     defaultVariants: { tone: "default" },
 * });
 *
 * Inside the component you destructure the resolved slot functions:
 *
 * const { root, header, title, body, footer } = card({ tone });
 *
 * Each slot is itself callable so call-site overrides compose cleanly:
 *   <div className={root({ class: className })}> … </div>
 *
 * `tv()` runs `twMerge` for you on every call — no need to wrap with `cn()` when only the
 * resolved slot is involved. Use `cn()` only when mixing a slot result with non-`tv` strings.
 */

/* ─────────────────────────── Component ────────────────────────── */

export interface ComponentNameProps
    extends React.ComponentProps<typeof BaseComponentName.Root>,
        VariantProps<typeof componentName> {
    /** JSDoc on every exported prop — these flow to the showcase props table. */
    asChild?: boolean;
}

/**
 * One-paragraph description of what this primitive does and when to use it. The first line
 * is the "contract" — what the primitive guarantees. Pulled into the showcase intro.
 */
function ComponentName({ className, variant, size, ...props }: ComponentNameProps) {
    return (
        <BaseComponentName.Root
            data-slot="component-name"
            className={componentName({ variant, size, class: className })}
            {...props}
        />
    );
}
ComponentName.displayName = "ComponentName";

export { ComponentName };
```

Floating primitives add the `Portal + Positioner + Popup` pattern from `popover.tsx` / `sheet.tsx`. Non-Base-UI primitives drop the Base UI import and use a plain element.

## Definition of done (this session)

A reviewer pasting this prompt into a fresh session and walking through the checklist should be able to verify every box without diving into individual files.

- [ ] `apps/admin/src/design-system/` exists with the tree shown above.
- [ ] `DESIGN_SYSTEM.md` documents tokens, primitive list, file template, quality bar, and contribution rules. Future agents read this first.
- [ ] Every primitive in the tables above exists, exports its props type, sets `data-slot` and `displayName`, and uses CSS-variable tokens.
- [ ] `DatePicker` / `TimePicker` are **not** in the tree (a separate PR owns them).
- [ ] No `ml-*` / `mr-*` / `text-left` / `text-right` / `left-*` / `right-*` in the new system. Grep proves it.
- [ ] Every primitive that exposes variants uses `tv()` from `tailwind-variants`. Grep for `cva(` in the new `design-system/` tree returns zero hits.
- [ ] No new package dependencies except (potentially) `shiki` and `tailwind-variants` — and those are added to the catalog with explicit approval if they weren't already there.
- [ ] `pnpm --filter @calibra/admin typecheck` passes.
- [ ] `pnpm --filter @calibra/admin lint` passes.
- [ ] `/dev/ds` renders in dev with side nav of every primitive.
- [ ] Each primitive page shows: variants, states, code samples (Shiki-rendered), props table, a11y notes, edge-case gallery.
- [ ] Every async-aware primitive (per the table in the "Async + loading state" section) has a showcase entry demonstrating Idle / Loading / Empty / Error / Slow-network states with realistic mock data, plus a toggle panel above the demo for the operator to flip between them.
- [ ] `apps/admin/src/design-system/lab/mock/` exists with `delay`, `withLatency`, `withRandomLatency`, `withFailure`, and fixture lists for products / categories / brands / customers / orders.
- [ ] RTL/LTR toggle on the showcase actually flips the demo, leaving the surrounding admin chrome unchanged.
- [ ] Theme toggle on the showcase actually flips light/dark, scoped the same way.
- [ ] Existing app code is **untouched** — `git diff --stat -- apps/admin/src/app apps/admin/src/views apps/admin/src/lib` returns zero changes.
- [ ] The dev-only "DS" link in the topbar is the only change to existing navigation files; nothing else in the existing app pages renders differently.
- [ ] Commits are conventional, grouped by category (one for tokens, one per primitive group, one for showcase shell, one for showcase pages).

## Out of scope (do NOT do in this session)

- Replacing any existing `components/ui/*` usage in views, pages, or library files.
- Deleting the existing `components/ui/` directory.
- Changing the admin's existing navigation beyond adding one dev-only DS link.
- Writing migration codemods (a separate session handles that).
- Adding test coverage for the primitives (typecheck + manual review via the showcase is the gate for now).
- Touching `apps/web/` (the storefront stays pure Tailwind; it's not a consumer of the admin DS).
- **Date / time pickers.** A separate PR owns the date-input surface. Don't build `DatePicker`, `TimePicker`, `Calendar`, or any wrapper — not even a stub. Don't add them to the showcase nav.

## Open questions to surface to the user before starting

1. **Shiki**: confirm it's allowed before adding it. The bundle cost is ~50kb gzipped server-side only when used correctly.
2. **Brand color**: read `globals.css` for any existing brand hue. If none, default `primary` to a slate-leaning indigo; the user can swap later.
3. **`tailwind-variants` catalog approval**: confirm `tailwind-variants` can be added to `pnpm-workspace.yaml#catalogs.default` (pinned to the latest stable; ~14kb gzipped, no runtime deps beyond `tailwind-merge` which is already in the catalog). Every primitive's variant surface depends on it.

Surface these as one numbered list at the start of the session, wait for answers, then proceed.

## How to pace this

The build is large but bounded. Suggested phasing across however many sessions it takes:

1. **Tokens + showcase shell + Button + Input + Card** (one PR). Proves the architecture end-to-end with three real primitives + the showcase site.
2. **Layout / structure primitives** (Box, Stack, Card variants, Separator, ScrollArea, AspectRatio).
3. **Floating primitives** (Popover, Tooltip, HoverCard, Dialog, Sheet, Drawer).
4. **Form primitives part 1** (Label, Field, Input, Textarea, NumberField, Checkbox, Radio, Switch).
5. **Form primitives part 2** (Select, Combobox, MultiCombobox, Slider, ToggleGroup, Form).
6. **Menus + Navigation** (DropdownMenu, ContextMenu, Menubar, NavigationMenu, Tabs, Accordion, Toolbar, Breadcrumb, Pagination).
7. **Feedback + Data** (Badge, Alert, Toast, Progress, Meter, Spinner, Skeleton, EmptyState, Avatar, AvatarGroup, Kbd, Code, CodeBlock, DescriptionList).

Each phase is its own PR. CI is green before the next phase starts.

Begin by reading the listed files, then post the open-questions list and wait for answers. Don't write code before alignment on those three decisions.
