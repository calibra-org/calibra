# `components/business/` — Tier-4 Business Primitives

The formal home for tier-4 primitives: UI primitive (tier 2 or 3) wired to an API query/mutation, domain-aware. Distinguishing rule from tier-2/3: tier-4 files import from `#/lib/queries/...` and encode a specific resource's shape.

## Folder convention

Same as tier 2/3 (see DESIGN_SYSTEM.md §2):

```
components/business/<name>/
├── index.tsx              # default export + convenience wrapper
├── <name>.parts.tsx       # compound subparts (when there are subparts)
├── <name>.variants.ts     # tv() variants (when there's variant API)
├── README.md
```

## Current state (after prompt 05)

| Primitive | Composes | Wires to |
|---|---|---|
| `EntityCombobox` (tier 3, lives under `components/ui/entity-combobox/`) | `Combobox` / `MultiCombobox` | — (canonical async-picker base) |
| `ProductPicker` | `EntityCombobox` | `#/lib/queries/products` |
| `CategoryPicker` | `EntityCombobox` | `#/lib/queries/...` |
| `BrandPicker` | `EntityCombobox` | `#/lib/queries/...` |
| `CustomerPicker` | `EntityCombobox` | `#/lib/queries/customers` |
| `StatusBadge` | `Badge` | (renders coloured tone pill — no API) |
| `OrderStatusBadge` | `StatusBadge` | maps `OrderStatus` → tone |
| `MoneyInput` | `NumberField` | `#/lib/format` + `#/lib/money` |
| `AddressCard` / `AddressForm` | `Card` / `Input` | address-shape mapping |
| `StatCard` | `Card` | `#/lib/format` |
| `Sparkline` | raw SVG | — |

Each folder currently re-exports the existing implementation from its previous flat location. The full extraction (separate parts.tsx + variants.ts + dedicated query hooks per picker) is a follow-up. This establishes the tier-4 home so every business primitive in the admin lives in one place, and prompt-05's canonical paths (`#/components/business/<name>`) work today.

## Existing flat files

Until the extraction lands, the legacy flat files (`components/StatusBadge.tsx`, `components/OrderStatusBadge.tsx`, `components/StatCard.tsx`, `components/AddressCard.tsx`, `components/Sparkline.tsx`, `components/ui/money-input.tsx`, `views/coupons/shared/*-picker.tsx`) keep working — call sites import from either path while the migration is in flight.
