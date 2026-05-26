# Data-grid list pages

Every list page in `apps/admin` shares the same skeleton — header + status tabs + toolbar + table + bulk-action bar — so an operator that learns one list reads the next without re-orienting. This file is the source of truth for the toolbar piece. For the per-row table itself see `data-table.tsx`; for detail / editor screens see `../sections/DETAIL_PAGE.md`.

## Skeleton

```
┌─────────────────────────────────────────────────────────────────────┐
│ Title                                              [actions...]     │  ← PageHeader
│ Subtitle                                                            │
├─────────────────────────────────────────────────────────────────────┤
│ [Tab1] [Tab2] [Tab3]                                                │  ← Status tabs
├─────────────────────────────────────────────────────────────────────┤
│ [Search...]  [Facet1▾] [Facet2▾] [Toggle1] [Toggle2]      [نمایش ↻] │  ← DataGridToolbar
│ [chip×] [chip×] [chip×]  پاک‌سازی همه                                │
├─────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ☐  Col1   Col2   Col3   …                            Actions    │ │  ← DataTable
│ │ ☐  …                                                           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│ {N} selected · Activate · Disable · …  · Clear selection            │  ← Bulk bar (appears on selection)
└─────────────────────────────────────────────────────────────────────┘
```

## Primitives (low-level)

These already exist under `apps/admin/src/components/data-table/` and rarely need wiring directly:

- `DataTable` — the table itself (sticky columns, drag-and-drop reorder, density, pagination).
- `DataTableToolbar` — search input + facet chips + toggle chips + clear-all + refresh + a `rightSlot` for the view-options button.
- `DataTableViewOptions` — popover with column visibility checkboxes and density radio.
- `ActiveFilterChips` — the chip row that shows currently-applied filters with a × on each.
- `DataTableBulkBar` — slide-in footer that appears when `selectedIds.size > 0`.
- `useDataTable` — hook that owns the URL-synced filter / pagination / selection state.

## Abstraction (high-level)

`DataGridToolbar` bundles the three toolbar pieces into one component so each list page passes its state once instead of re-wiring the same labels + computed flags. Use this for every new list — don't compose the primitives by hand unless you have a reason a wrapper can't satisfy.

```tsx
import {
    DataGridToolbar,
    buildDataGridToolbarLabels,
} from "#/components/data-table";

<DataGridToolbar
    q={tableState.q}
    onQChange={tableState.setQ}
    facets={facets}
    facetValues={tableState.facetValues}
    onFacetValuesChange={tableState.setFacetValues}
    toggles={toggles}
    toggleValues={tableState.toggleValues}
    onToggleChange={tableState.setToggleValue}
    columns={columnVisibilityItems}
    columnVisibility={tableState.columnVisibility}
    onColumnVisibilityChange={tableState.setColumnVisibility}
    density={tableState.density}
    onDensityChange={tableState.setDensity}
    onRefresh={() => refetch()}
    labels={buildDataGridToolbarLabels(t, t("search"))}
/>
```

`buildDataGridToolbarLabels(t, searchPlaceholder)` pulls the standard label set from a flat namespace by convention — every list page must register these keys:

| Key                             | Persian       | English      |
|---------------------------------|---------------|--------------|
| `refresh`                       | بازخوانی      | Refresh      |
| `toolbar.clearAll`              | پاک‌سازی همه  | Clear all    |
| `toolbar.clearFilter`           | حذف           | Remove       |
| `toolbar.viewOptions`           | **نمایش**     | **View**     |
| `toolbar.columns`               | ستون‌ها       | Columns      |
| `toolbar.density`               | تراکم         | Density      |
| `toolbar.densityComfortable`    | گسترده        | Comfortable  |
| `toolbar.densityCozy`           | متوسط         | Cozy         |
| `toolbar.densityCompact`        | فشرده         | Compact      |
| `bulk.selectedCount`            | {count} مورد… | {count} selected |

**The view-options trigger is always "نمایش" / "View"** — not "تنظیمات نما" or "View options" or any other variant. Other list pages have used the short form for months; new lists must match.

## What the abstraction takes off your plate

| Concern                                                | Handled inside `DataGridToolbar` |
|--------------------------------------------------------|:--------------------------------:|
| Computing `hasActiveFilters` from facets + toggles     |                ✓                |
| Deriving active-filter chips from facet defs + values  |                ✓                |
| `Clear all` wiring (clears q + every facet + toggle)   |                ✓                |
| Rendering the chip strip below the toolbar             |                ✓                |
| Wiring the view-options popover with consistent labels |                ✓                |

Per-list responsibility: build the facet defs (with localized labels), build the column visibility map, hand the state in.

## Adopting in a new list

1. Add the standard toolbar keys to your `[Entity]` namespace in both `messages/fa.json` and `messages/en.json` — match the table above. Use **"نمایش" / "View"** for `toolbar.viewOptions`.
2. Build your `facets: FacetedFilterDef[]` and `toggles: ToggleFilterDef[]`.
3. Build your `columnVisibilityItems: ColumnVisibilityItem[]`.
4. Render `<DataGridToolbar>` inside the table's `toolbar` prop:

```tsx
<DataTable
    ...
    toolbar={
        <DataGridToolbar
            q={tableState.q}
            onQChange={tableState.setQ}
            ...
        />
    }
/>
```

That's it. Don't reach for the lower-level primitives unless you genuinely need to (e.g. an "Export" button outside the right slot — pass it as `leadingRightSlot`).

## When to drop down to the primitives

The wrapper is intentionally narrow. Drop to `DataTableToolbar` / `DataTableViewOptions` / `ActiveFilterChips` directly when you need:

- A toolbar without a view-options button (rare).
- A toolbar that renders bulk-actions inline instead of in the floating bar (e.g. a fixed-selection workflow).
- A facet that takes a custom popover content instead of the standard option list.

In every other case use `DataGridToolbar`.

## Async multi-selects: use `MultiCombobox`

Anywhere a form needs "pick one or more entities from a remote search" — product / category / brand pickers, customer search on the test-runner, email allow-list with autocomplete, future tag pickers — reach for `MultiCombobox` from `components/ui/combobox.tsx`. It's built on Base UI's `Combobox` parts, so the popup:

- Floats above any Sheet / Dialog the trigger sits in (via `Combobox.Portal`).
- Runs collision detection with 16px viewport padding (the popup flips / shifts to stay on-screen even when the trigger sits at the inline edge of a sheet).
- Truncates long item text via `min-w-0 truncate` so a 200-char product name doesn't blow the popup out horizontally.
- Caps the scroll list at `min(15rem, 60vh)` so it doesn't run off the bottom on short viewports.

The thin `EntityPicker` under `components/shared/` is a back-compat shim for the legacy coupons pickers. New consumers should target `MultiCombobox` directly.

