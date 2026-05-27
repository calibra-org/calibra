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

## Migrating a list page off `useDataTable`

`useDataTable` ([`#/components/ui/data-grid`](../../components/ui/data-grid/use-data-table.ts))
is the legacy monolithic hook that bundles URL plumbing + UI state + per-facet abstractions. New
pages should use `useTableView` + `useColumnState` + `useSelectionState` instead. Existing pages
can migrate incrementally — they currently compose a `TableViewQuery` via `useMemo` on top of
`useDataTable`'s outputs, which still works.

When migrating a page:

1. Replace the URL pieces of `useDataTable` (`page`, `limit`, `sort`, `q`, `facetValues`,
   `toggleValues`, `dateFacetValues`) with `useTableView({ extras })`.
2. Build `TableViewFilter[]` entries directly inside the toolbar's facet `onChange` handlers,
   calling `tv.setFilter([...])` to write them through. The per-facet UI affordances
   (`DataTableFacetedFilter`, `DataTableToolbar`) accept whatever shape the page wires up —
   they aren't bound to `useDataTable`'s abstractions.
3. Replace UI state (`density`, `columnVisibility`, `columnOrder`) with `useColumnState`.
4. Replace selection (`selectedIds`, `setSelected`, `clearSelection`) with `useSelectionState`.
5. Drop the `useMemo`-based projection — the page reads `tv.query` directly and forwards it to
   the list query hook (`useOrdersList`, `useCustomersList`, …).

See the server-side ADR §11 for the broader migration context. The pages currently in flight
(`orders-list.tsx`, `customers-list.tsx`, `products-list.tsx`, `reviews-list.tsx`,
`coupons-list.tsx`) are functional with the dual-hook pattern and don't need to migrate to
ship; the consolidation is pure code-quality follow-up.
