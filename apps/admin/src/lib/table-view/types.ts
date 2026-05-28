import type { TableViewOperator, TableViewSortDir } from "./constants";

/**
 * Primitive values the wire grammar carries. Scalars for single-value ops, arrays of scalars for
 * `in` / `nin` / `between`, `null` for void ops (`isnull` / `notnull`).
 */
export type TableViewPrimitive = string | number | boolean | null;

export interface TableViewFilter {
    field: string;
    op: TableViewOperator;
    value: TableViewPrimitive | ReadonlyArray<TableViewPrimitive>;
}

export interface TableViewSort {
    field: string;
    dir: TableViewSortDir;
}

/**
 * The canonical client-side representation of a TableView query. Mirrors the server's
 * `ParsedTableViewQuery` shape (post-validator) with one departure: `filter` and `filterOr` are
 * arrays here, not field-keyed maps. The serializer collapses duplicates per group anyway, so
 * the array shape is the easier thing for components to mutate in place.
 *
 * `page` defaults to `1`, `limit` defaults to `20`. Neither is serialized when at the default —
 * keeps URLs short and matches the server's optional schema.
 */
export interface TableViewQuery {
    page: number;
    limit: number;
    filter: TableViewFilter[];
    filterOr: TableViewFilter[];
    sort: TableViewSort[];
}

export const EMPTY_TABLE_VIEW_QUERY: TableViewQuery = {
    page: 1,
    limit: 20,
    filter: [],
    filterOr: [],
    sort: [],
};
