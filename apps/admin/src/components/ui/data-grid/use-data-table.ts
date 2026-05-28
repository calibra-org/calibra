/**
 * Legacy util exports. The original `useDataTable` hook owned URL state + facet
 * abstractions + UI state in a single monolithic shape; every consuming page has been
 * migrated to the smaller, single-purpose primitives:
 *
 * - URL state → {@link import("#/lib/table-view").useTableView}
 * - Persisted UI state → {@link import("./use-column-state").useColumnState}
 * - In-memory selection → {@link import("./use-selection-state").useSelectionState}
 *
 * Only the small URL-shape utilities below survive — kept for the few callers (test fixtures,
 * data-grid pagination footer) that still want a parsed sort token or the default per-page
 * options list.
 */
import type { PaginationMeta, SortState } from "./types";

/**
 * Default per-page selectable steps shown in the pagination footer. Callers may override via
 * the `limitOptions` prop on `<DataTable>`.
 */
export const DEFAULT_LIMIT_OPTIONS = [10, 20, 50, 100] as const;

/**
 * Parses `?sort=name` or `?sort=-name` into {@link SortState}. Returns `undefined` for an
 * empty or missing value so the underlying query stays unsorted on first paint.
 *
 * The TableView wire grammar uses `?sort[]=field:dir` form; this util survives only for
 * compat with the column-header component's existing single-sort `{id, direction}` shape.
 * See `singleSortToTableView` / `tableViewToSingleSort` in the table-view package for the
 * bridge.
 */
export function parseSort(value: string | null): SortState | undefined {
    if (value === null || value === "") return undefined;
    if (value.startsWith("-")) return { id: value.slice(1), direction: "desc" };
    return { id: value, direction: "asc" };
}

/** Serializes a {@link SortState} back to its `?sort=…` representation (legacy shape). */
export function serializeSort(state: SortState | undefined): string {
    if (state === undefined) return "";
    return state.direction === "desc" ? `-${state.id}` : state.id;
}

/** Produce an empty {@link PaginationMeta} shape when no data has arrived yet. */
export function emptyPaginationMeta(limit: number): PaginationMeta {
    return { page: 1, limit, total: 0, lastPage: 1 };
}
