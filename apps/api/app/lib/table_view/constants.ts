/**
 * The complete catalogue of operators understood by the TableView wire grammar. Order matters
 * only for readability — runtime lookups are by membership.
 *
 * Mirrors `technance-backend/packages/typeorm/src/table-view/constants.ts` verbatim. DX
 * consistency across our sister projects outranks any local cleverness.
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

/**
 * Order directions accepted in the canonical lowercase form. Wire input is case-insensitive — the
 * grammar's regex matches `(asc|desc|ASC|DESC)` — but the parsed value is always normalised down
 * to lowercase so consumers and Lucid's `.orderBy()` see a single shape.
 */
export const TABLE_VIEW_SORT_DIRS = ["asc", "desc"] as const;
export type TableViewSortDir = (typeof TABLE_VIEW_SORT_DIRS)[number];

/** Operators that take no value (the URL slot is `field:isnull` or `field:notnull`). */
export const VOID_OPERATORS = ["isnull", "notnull"] as const satisfies ReadonlyArray<TableViewOperator>;

/** Operators every column type supports regardless of declared type. */
export const UNIVERSAL_OPERATORS = ["eq", "neq", "isnull", "notnull"] as const satisfies ReadonlyArray<TableViewOperator>;

const ENUM_OPS = [...UNIVERSAL_OPERATORS, "in", "nin"] as const satisfies ReadonlyArray<TableViewOperator>;

const NUMERIC_OPS = [
    ...UNIVERSAL_OPERATORS,
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "nin",
    "between",
] as const satisfies ReadonlyArray<TableViewOperator>;

const DATE_OPS = [
    ...UNIVERSAL_OPERATORS,
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
] as const satisfies ReadonlyArray<TableViewOperator>;

const STRING_OPS = [
    ...UNIVERSAL_OPERATORS,
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
] as const satisfies ReadonlyArray<TableViewOperator>;

const BOOLEAN_OPS = [...UNIVERSAL_OPERATORS] as const satisfies ReadonlyArray<TableViewOperator>;

/**
 * The semantic column-type vocabulary a view config declares its columns as. Picked to be
 * unambiguous across our Postgres column types — `bigint` and `int` collapse into `number`,
 * `text` / `varchar` / `citext` / `uuid` collapse into `string`. `enum` carries an extra
 * `values` array on the view config so the operator catalogue can stay strict.
 *
 * Add a new entry here only when adding a genuinely new operator-validity bucket, not when
 * adding a new Postgres type that fits an existing bucket.
 */
export const TABLE_VIEW_COLUMN_TYPES = [
    "number",
    "bigint",
    "decimal",
    "boolean",
    "string",
    "datetime",
    "date",
    "enum",
    "uuid",
    "json",
] as const;

export type TableViewColumnType = (typeof TABLE_VIEW_COLUMN_TYPES)[number];

/**
 * Per-type operator validity matrix. A filter whose `op` is not in the list for its column's
 * declared `type` is rejected at validation time with a 422 — not silently dropped at runtime.
 *
 * Unknown / unsupported types fall back to the universal set in the validator; the matrix only
 * lists known buckets.
 */
export const OPERATORS_BY_COLUMN_TYPE = {
    number: NUMERIC_OPS,
    bigint: NUMERIC_OPS,
    decimal: NUMERIC_OPS,
    boolean: BOOLEAN_OPS,
    string: STRING_OPS,
    uuid: STRING_OPS,
    datetime: DATE_OPS,
    date: DATE_OPS,
    enum: ENUM_OPS,
    /** JSON columns are opaque; only equality + existence make sense for v1. */
    json: UNIVERSAL_OPERATORS,
} as const satisfies Record<TableViewColumnType, ReadonlyArray<TableViewOperator>>;

/**
 * Default pagination cap. The wire field is `limit`; the response envelope key stays `perPage`
 * for back-compat with everything consuming `Paginated<T>` already.
 */
export const TABLE_VIEW_DEFAULT_LIMIT = 20;
export const TABLE_VIEW_MAX_LIMIT = 100;
