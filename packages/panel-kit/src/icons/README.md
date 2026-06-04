# `#/icons`

Single re-export surface for every icon used in the admin. **This is the only place that imports from `lucide-react`** — Biome blocks direct `lucide-react` imports anywhere else under `apps/admin/src/`.

## Why this exists

1. **Centralised swap.** If we ever migrate off lucide-react (Phosphor, Tabler, custom set), every consumer changes via this module — not 135 files.
2. **RTL-aware directional icons.** Logical aliases (`ChevronStart`, `ChevronEnd`, `ArrowStart`, `ArrowEnd`, `ChevronsStart`, `ChevronsEnd`) tag the underlying icon with `data-rtl-flip` so the CSS rule in `globals.css` flips it under `dir="rtl"` automatically. Business code never picks the wrong direction by accident.
3. **One name for "loading".** `Spinner` is an alias for `Loader2` so the admin uses one consistent name.

## How to use

```tsx
import { Search, Trash2, Spinner, ChevronStart, ChevronEnd } from "#/icons";

<Search className="size-4" aria-hidden />
<Spinner className="size-4 animate-spin" aria-hidden />
<ChevronStart className="size-4" aria-hidden />   {/* flips under RTL */}
```

## How to add a new icon

1. Pick a name from [lucide.dev/icons](https://lucide.dev/icons).
2. Add it (alphabetised) to `icons.generated.ts`.
3. If it's directional (chevron / arrow / caret) and used for "previous"/"next"/"back"/"forward" semantics, ALSO add a logical alias in `directional.tsx`. Otherwise skip — non-directional icons render the same in both directions.

## What's enforced

- Biome `noRestrictedImports` blocks `from "lucide-react"` anywhere under `apps/admin/src/` except this folder. Violations fail `pnpm --filter @calibra/admin lint`.
- The directional-icons aliases set `data-rtl-flip`; the CSS rule lives in `apps/admin/src/styles/globals.css` (`:where([dir="rtl"]) [data-rtl-flip] { scale: -1 1; }`).
