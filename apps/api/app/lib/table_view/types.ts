import type { LucidModel, ModelQueryBuilderContract } from "@adonisjs/lucid/types/model";
import type { VineObject } from "@vinejs/vine";
import type { ConstructableSchema } from "@vinejs/vine/types";

import type { TableViewColumnType, TableViewOperator, TableViewSortDir } from "./constants.js";

/**
 * Primitive values the wire grammar coerces to.
 */
export type TableViewPrimitive = string | number | boolean | null;

/**
 * A column declaration inside a {@link TableViewConfig}. The key in the parent map is the wire
 * field name (also the URL query field — `?filter[]=created_at:lt:...`); `column` overrides the
 * SQL column name when the wire name differs from the database identifier.
 */
export interface TableViewColumn {
    /** Semantic bucket used to derive the allowed operator set for this column. */
    type: TableViewColumnType;
    /** Override the SQL identifier. Defaults to the map key. */
    column?: string;
    /** When `false`, this column is shown in `orderable` listings only, never in `filter[]`. */
    filterable?: boolean;
    /** When `false`, this column is shown in `filter[]` listings only, never in `sort[]`. */
    orderable?: boolean;
    /**
     * Allowed values when `type === 'enum'`. Surfaced in 422 errors so the operator sees the
     * legal set; never enforced as a value-by-value check at the view layer — that's a DB
     * constraint or domain enum check.
     */
    values?: ReadonlyArray<string>;
}

/**
 * Single-level relation declaration. The key in the parent map is the Lucid relation name
 * (camelCase — `customer`, `orderLines`). At query time we join the relation's table once and
 * scope `where`s against the joined columns.
 *
 * Multi-level relations are out of scope for v1 (the FlattenRelation generics from technance
 * cost more than they pay for until a real second-level need appears).
 */
export interface TableViewRelation {
    /** Filterable / orderable column declarations on the joined table. */
    columns: Record<string, TableViewColumn>;
}

/**
 * The user-facing config the consumer hands to {@link createTableView}.
 *
 * @example
 * createTableView({
 *     model: Order,
 *     columns: {
 *         status: { type: "enum", values: ORDER_STATUS_VALUES, filterable: true, orderable: true },
 *         created_at: { type: "datetime", filterable: true, orderable: true },
 *     },
 *     defaultSort: [["created_at", "desc"], ["id", "desc"]],
 * });
 */
export interface TableViewConfig<Model extends LucidModel, Columns extends Record<string, TableViewColumn>> {
    model: Model;
    /** Map of wire-field name → column declaration. Pass `as const` for literal-type inference. */
    columns: Columns;
    /** Single-level relation declarations. Field path is `<relationKey>.<childColumn>`. */
    relations?: Record<string, TableViewRelation>;
    /** Sort entries applied when the wire `sort[]` array is empty. */
    defaultSort?: ReadonlyArray<readonly [string, TableViewSortDir]>;
}

/**
 * Parsed wire-level filter entry. `value` carries through whatever the value-coercion step
 * decided — scalars for single-value ops, arrays for `in`/`nin`/`between`, `null` for void ops.
 */
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
 * Normalised output of the Vine schema bound to a view. Carries the operator-supplied filter
 * map (one entry per field; multiple constraints for the same field are rejected at parse time
 * — match technance) plus pagination + sort state.
 */
export interface ParsedTableViewQuery<Filterable extends string = string, Orderable extends string = string> {
    page: number;
    limit: number;
    filter: Partial<Record<Filterable, TableViewFilter>>;
    filterOr: Partial<Record<Filterable, TableViewFilter>>;
    sort: Partial<Record<Orderable, TableViewSort>>;
}

/**
 * Controller-supplied overrides that bypass the filterable/orderable whitelist. Use for trusted
 * scopes that the URL must not be able to override — tenant id, soft-delete, role-gated
 * visibility filters that aren't safe to expose to the operator.
 */
export interface TableViewRunOptions {
    filter?: Record<string, Omit<TableViewFilter, "field">>;
    filterOr?: Record<string, Omit<TableViewFilter, "field">>;
    sort?: Record<string, Omit<TableViewSort, "field">>;
}

/** Response envelope. Mirrors the existing `Transformer.paginate(paginator)` output. */
export interface PaginationMeta {
    page: number;
    perPage: number;
    total: number;
    lastPage: number;
}

export interface TableViewRunResult<TRow> {
    data: TRow[];
    meta: PaginationMeta;
}

/**
 * Compile-time witness that the keys of a `columns` map are string literals. Drives the
 * filterable / orderable literal-union types on the parsed query.
 */
type FilterableFields<Columns extends Record<string, TableViewColumn>> = {
    [K in keyof Columns & string]: Columns[K]["filterable"] extends false ? never : K;
}[keyof Columns & string];

type OrderableFields<Columns extends Record<string, TableViewColumn>> = {
    [K in keyof Columns & string]: Columns[K]["orderable"] extends false ? never : K;
}[keyof Columns & string];

/**
 * The runtime artifact returned by {@link createTableView}. `schema` is the Vine schema you
 * `vine.compile` into a validator; `run` consumes the parsed query plus a pre-scoped query
 * builder; `config` is the raw config exposed for tooling (the Ace allowed-fields dumper).
 */
export interface TableView<Model extends LucidModel, Columns extends Record<string, TableViewColumn>> {
    config: TableViewConfig<Model, Columns>;
    schema: VineObject<
        Record<string, ConstructableSchema<unknown, unknown, unknown>>,
        unknown,
        ParsedTableViewQuery<FilterableFields<Columns>, OrderableFields<Columns>>,
        unknown
    >;
    run<TRow = InstanceType<Model>>(
        builder: ModelQueryBuilderContract<Model, InstanceType<Model>>,
        query: ParsedTableViewQuery<FilterableFields<Columns>, OrderableFields<Columns>>,
        options?: TableViewRunOptions,
    ): Promise<TableViewRunResult<TRow>>;
    /** Wire field name → column declaration; flattens relations for tooling consumers. */
    allowedFields: {
        filterable: ReadonlyArray<string>;
        orderable: ReadonlyArray<string>;
    };
}

/**
 * Infer the parsed query shape from a view, used to type-annotate controller args without
 * re-deriving the literal-union types from the column map by hand.
 *
 * @example
 * type Q = InferTableViewQuery<typeof adminOrdersView>;
 */
export type InferTableViewQuery<V extends TableView<LucidModel, Record<string, TableViewColumn>>> = V extends TableView<
    infer _Model,
    infer Columns
>
    ? ParsedTableViewQuery<FilterableFields<Columns>, OrderableFields<Columns>>
    : never;
