/**
 * Client-side mirror of `apps/api/app/lib/table_view/constants.ts`. The grammar contract is
 * frozen — keep the two lists byte-for-byte in sync. Updating one without the other will fail
 * the server's 422 path or silently strip the operator client-side.
 */
export const TABLE_VIEW_OPERATORS = [
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "nlike",
    "nilike",
    "inc",
    "iinc",
    "ninc",
    "niinc",
    "in",
    "nin",
    "between",
    "isnull",
    "notnull",
] as const;

export type TableViewOperator = (typeof TABLE_VIEW_OPERATORS)[number];

export const TABLE_VIEW_SORT_DIRS = ["asc", "desc"] as const;
export type TableViewSortDir = (typeof TABLE_VIEW_SORT_DIRS)[number];

export const VOID_OPERATORS = ["isnull", "notnull"] as const satisfies ReadonlyArray<TableViewOperator>;
