# Admin FE TableView primitive

URL-backed state for every list page on the admin. Mirrors the server-side primitive at
[`apps/api/app/lib/table_view/`](../../../../api/app/lib/table_view/) — the wire grammar that
this module produces is the wire grammar that module consumes.

## Layout

- `constants.ts` — operator + sort-direction vocab, default page/limit, default `TableViewQuery`.
- `types.ts` — `TableViewQuery`, `TableViewFilter`, `TableViewSort`, `TableViewPrimitive`.
- `serialize.ts` — `parseTableViewQuery(searchParams)` + `serializeTableViewQuery(query)`.
- `date-adapter.ts` — `dateFilterValueToTableViewFilter(field, value)` projects a date-picker
  `DateFilterValue` onto a single `TableViewFilter` entry with the right bounds.
- `use-table-view.ts` — `useTableView({ initial?, extras? })` reads/writes the URL.

The list pages that compose a query manually (without `useDataTable`) use this module directly.

## `useTableView` — URL-backed query hook

```ts
import { parseAsBoolean, parseAsString, parseAsStringEnum } from "nuqs";

const tv = useTableView({
    /** Applied once on the first render when the URL is empty. */
    initial: { sort: [{ field: "created_at", dir: "desc" }] },
    /** Endpoint-specific top-level extras alongside the TableView wire keys. Each parser must
     *  carry a `.withDefault(...)` so the hook can read absent values + strip default-equal
     *  entries from the URL on serialise. */
    extras: {
        q: parseAsString.withDefault(""),
        tab: parseAsStringEnum(["any", "trashed"]).withDefault("any"),
        trashed: parseAsBoolean.withDefault(false),
    },
});

// Read:
tv.query;        // TableViewQuery — page/limit/filter/filterOr/sort
tv.q;            // string  (from extras)
tv.tab;          // "any" | "trashed"
tv.trashed;      // boolean

// Write — each setter resets page to 1:
tv.setFilter([{ field: "status", op: "eq", value: "active" }]);
tv.setSort([{ field: "id", dir: "desc" }]);
tv.setPage(2);
tv.setLimit(50);
tv.setQ("alice");          // typed setter generated per extras key
tv.setTab("trashed");
tv.setTrashed(true);
tv.upsertDateFilter("created_at", pickerValue);  // date-picker adapter
tv.clearFilters();
```

Setters all funnel through one `router.replace(...)` per call, so URL state stays coherent
across back-to-back updates.

## Companion UI-state hooks (data-grid module)

`useTableView` only handles URL state. List pages compose three smaller hooks for UI-only
state alongside it (none of these touch the URL — UI affordances stay out of shareable links):

```ts
import { useColumnState, useSelectionState } from "#/components/ui/data-grid";

const ui = useColumnState({
    id: "orders.list",
    defaultColumnVisibility: { shipTo: false, items: false },
});
ui.density;            // "compact" | "comfortable" | "spacious" — persisted to localStorage
ui.columnVisibility;   // Record<string, boolean>
ui.columnOrder;        // string[]

const sel = useSelectionState();
sel.selectedIds;       // ReadonlySet<string>
sel.setSelected(next);
sel.clearSelection();
```

## How the list pages compose

Every admin list page (`orders-list.tsx`, `customers-list.tsx`, `products-list.tsx`,
`reviews-list.tsx`, `coupons-list.tsx`) follows the same composition:

1. `useTableView({ extras })` owns URL state — page, limit, filter[], filterOr[], sort[], plus
   the endpoint-specific extras (`q`, `tab`, `trashed`, picker URL strings, etc.).
2. `useColumnState({ id, defaultColumnVisibility })` owns persisted UI state — visibility,
   density, column order in localStorage (namespaced per page id).
3. `useSelectionState()` owns in-memory selection (`selectedIds`).
4. The toolbar's facet shape (`facetValues: Record<string, string[]>`) is **projected** from
   the canonical state — either via `useFacetValuesFromQuery` for facets that map onto
   `filter[]` entries (customers, orders), or from scalar extras for endpoints that take
   per-facet wire params (products, reviews, coupons). onChange handlers write back through
   the same projection.

The legacy monolithic `useDataTable` hook is deleted. Only its small URL-shape utilities
(`parseSort` / `serializeSort` / `DEFAULT_LIMIT_OPTIONS` / `emptyPaginationMeta`) survive for
the column-header + pagination-footer call sites.

See any of the migrated list pages for the full pattern; `customers-list.tsx` is the
cleanest reference (uses `useFacetValuesFromQuery` for TableView-backed facets + extras-backed
date-picker URL strings).
