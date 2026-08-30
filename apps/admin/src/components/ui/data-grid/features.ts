import {
    columnFilteringFeature,
    columnOrderingFeature,
    columnResizingFeature,
    columnSizingFeature,
    columnVisibilityFeature,
    createExpandedRowModel,
    rowExpandingFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    tableFeatures,
} from "@tanstack/react-table";

/**
 * The feature set every admin data grid is built from.
 *
 * v9 bundles nothing by default: an API is missing because its feature was not registered, not
 * because the library dropped it. Registering explicitly is also what keeps the bundle honest —
 * `stockFeatures` would pull in grouping, faceting, aggregation and pinning that no grid here uses.
 *
 * Sorting, filtering and pagination are all server-driven (`manualSorting` / `manualFiltering` /
 * `manualPagination`), but their features still have to be registered: `manual*` tells the table not
 * to compute the row model itself, it does not remove the state slice or its options.
 *
 * `columnSizingFeature` holds the widths; `columnResizingFeature` adds the drag interaction. v9
 * split what v8 combined, so the grid needs both to keep resizable columns.
 */
export const dataGridFeatures = tableFeatures({
    columnFilteringFeature,
    columnOrderingFeature,
    columnResizingFeature,
    columnSizingFeature,
    columnVisibilityFeature,
    rowExpandingFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    expandedRowModel: createExpandedRowModel(),
});

/** Inferred feature tuple — the first generic argument of every v9 table type. */
export type DataGridFeatures = typeof dataGridFeatures;
