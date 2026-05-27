import { Exception } from "@adonisjs/core/exceptions";
import type { LucidModel, ModelQueryBuilderContract } from "@adonisjs/lucid/types/model";
import type { RelationshipsContract } from "@adonisjs/lucid/types/relations";

import type { TableViewOperator } from "./constants.js";
import type {
    PaginationMeta,
    ParsedTableViewQuery,
    TableViewColumn,
    TableViewConfig,
    TableViewFilter,
    TableViewPrimitive,
    TableViewRunOptions,
    TableViewRunResult,
    TableViewSort,
} from "./types.js";

/**
 * Resolved column metadata used by the runtime. `sqlColumn` is the `<table>.<column>` reference
 * the WHERE/ORDER builders pass straight to Lucid; `joinKey` is set for relation fields so the
 * runtime knows which relation to add a JOIN for (once per relation regardless of how many
 * filter / sort entries reference its columns).
 */
interface ResolvedColumn {
    column: TableViewColumn;
    sqlColumn: string;
    joinKey?: string;
}

/**
 * Build the field-name → ResolvedColumn map once at config time. Walks the top-level columns
 * and one level of relations (the v1 scope) and emits an entry per accessible wire field.
 *
 * Throws synchronously when a relation key doesn't exist on the model — better to fail loud at
 * boot than silently swallow filter requests at request time.
 */
export function buildFieldIndex<Model extends LucidModel>(
    config: TableViewConfig<Model, Record<string, TableViewColumn>>,
): { fields: Map<string, ResolvedColumn>; relationMeta: Map<string, { tableName: string; relation: RelationshipsContract }> } {
    const fields = new Map<string, ResolvedColumn>();
    const relationMeta = new Map<string, { tableName: string; relation: RelationshipsContract }>();

    const tableName = config.model.table;

    for (const [key, col] of Object.entries(config.columns)) {
        const dbColumn = col.column ?? key;
        fields.set(key, { column: col, sqlColumn: `${tableName}.${dbColumn}` });
    }

    if (config.relations !== undefined) {
        for (const [relKey, relConfig] of Object.entries(config.relations)) {
            const relation = config.model.$relationsDefinitions.get(relKey);
            if (relation === undefined) {
                throw new Exception(
                    `TableView relation "${relKey}" not found on model ${config.model.name}. ` +
                        `Declared relations: ${Array.from(config.model.$relationsDefinitions.keys()).join(", ") || "(none)"}.`,
                    { status: 500, code: "E_TABLE_VIEW_INVALID_RELATION" },
                );
            }
            relation.boot();
            const relatedTable = relation.relatedModel().table;
            relationMeta.set(relKey, { tableName: relatedTable, relation });
            for (const [childKey, childCol] of Object.entries(relConfig.columns)) {
                const dbColumn = childCol.column ?? childKey;
                const wireField = `${relKey}.${childKey}`;
                fields.set(wireField, {
                    column: childCol,
                    sqlColumn: `${relatedTable}.${dbColumn}`,
                    joinKey: relKey,
                });
            }
        }
    }

    return { fields, relationMeta };
}

/**
 * Execute the parsed query against a pre-scoped Lucid builder. The builder is the controller's
 * authorisation surface (soft-delete, tenant id, preloads); the runtime only layers the
 * operator-supplied predicates on top.
 */
export async function runTableView<Model extends LucidModel, TRow = InstanceType<Model>>(
    config: TableViewConfig<Model, Record<string, TableViewColumn>>,
    fieldIndex: ReturnType<typeof buildFieldIndex<Model>>,
    builder: ModelQueryBuilderContract<Model, InstanceType<Model>>,
    parsed: ParsedTableViewQuery<string, string>,
    options?: TableViewRunOptions,
): Promise<TableViewRunResult<TRow>> {
    const { fields, relationMeta } = fieldIndex;
    const addedJoins = new Set<string>();

    const ensureJoin = (joinKey: string) => {
        if (addedJoins.has(joinKey)) return;
        const meta = relationMeta.get(joinKey);
        if (meta === undefined) {
            throw new Exception(`TableView attempted to join unknown relation "${joinKey}"`, {
                status: 500,
                code: "E_TABLE_VIEW_INVALID_RELATION",
            });
        }
        applyRelationJoin(builder, config.model, meta);
        addedJoins.add(joinKey);
    };

    /** AND group — every entry adds a top-level `.where(...)` clause. */
    const andEntries = collectFilters(parsed.filter, options?.filter);
    for (const filter of andEntries) {
        const resolved = resolveForOverride(fields, filter.field, options?.filter);
        if (resolved.joinKey !== undefined) ensureJoin(resolved.joinKey);
        applyFilterClause(builder, resolved.sqlColumn, filter);
    }

    /** OR group — wrapped in a single `.where(q => q.orWhere(...).orWhere(...))`. */
    const orEntries = collectFilters(parsed.filterOr, options?.filterOr);
    if (orEntries.length > 0) {
        for (const filter of orEntries) {
            const resolved = resolveForOverride(fields, filter.field, options?.filterOr);
            if (resolved.joinKey !== undefined) ensureJoin(resolved.joinKey);
        }
        builder.where((nested) => {
            for (const filter of orEntries) {
                const resolved = resolveForOverride(fields, filter.field, options?.filterOr);
                applyFilterClause(nested, resolved.sqlColumn, filter, /* asOr */ true);
            }
        });
    }

    /** Sort layering: wire-supplied entries first, then defaults the consumer didn't override. */
    const seenSort = new Set<string>();
    const sortEntries = collectSorts(parsed.sort, options?.sort);
    for (const sort of sortEntries) {
        const resolved = resolveForOverride(fields, sort.field, options?.sort);
        if (resolved.joinKey !== undefined) ensureJoin(resolved.joinKey);
        builder.orderBy(resolved.sqlColumn, sort.dir);
        seenSort.add(sort.field);
    }
    if (sortEntries.length === 0 && config.defaultSort !== undefined) {
        for (const [f, dir] of config.defaultSort) {
            if (seenSort.has(f)) continue;
            const resolved = fields.get(f);
            if (resolved === undefined) continue;
            if (resolved.joinKey !== undefined) ensureJoin(resolved.joinKey);
            builder.orderBy(resolved.sqlColumn, dir);
        }
    }

    const paginator = await builder.paginate(parsed.page, parsed.limit);
    const meta: PaginationMeta = {
        page: paginator.currentPage,
        perPage: paginator.perPage,
        total: paginator.total,
        lastPage: paginator.lastPage,
    };
    return { data: paginator.all() as unknown as TRow[], meta };
}

/**
 * Merge wire-supplied filters with controller-supplied overrides. Overrides win on conflict so
 * a tenant-scope filter the controller passes can't be displaced by an operator URL.
 */
function collectFilters(
    wire: Partial<Record<string, TableViewFilter>>,
    overrides: TableViewRunOptions["filter"] | TableViewRunOptions["filterOr"],
): TableViewFilter[] {
    const out: TableViewFilter[] = [];
    const seen = new Set<string>();
    if (overrides !== undefined) {
        for (const [field, entry] of Object.entries(overrides)) {
            seen.add(field);
            out.push({ field, op: entry.op, value: entry.value });
        }
    }
    for (const [field, entry] of Object.entries(wire)) {
        if (entry === undefined || seen.has(field)) continue;
        out.push(entry);
    }
    return out;
}

function collectSorts(
    wire: Partial<Record<string, TableViewSort>>,
    overrides: TableViewRunOptions["sort"],
): TableViewSort[] {
    const out: TableViewSort[] = [];
    const seen = new Set<string>();
    if (overrides !== undefined) {
        for (const [field, entry] of Object.entries(overrides)) {
            seen.add(field);
            out.push({ field, dir: entry.dir });
        }
    }
    for (const [field, entry] of Object.entries(wire)) {
        if (entry === undefined || seen.has(field)) continue;
        out.push(entry);
    }
    return out;
}

/**
 * When the override declares a field not in the view's column index, we synthesise a fallback
 * resolution that scopes against the model's own table (no relation join). Trusted scopes the
 * view didn't have to know about (tenant id, locale gates) work this way.
 */
function resolveForOverride(
    fields: Map<string, ResolvedColumn>,
    field: string,
    overrides: Record<string, unknown> | undefined,
): ResolvedColumn {
    const indexed = fields.get(field);
    if (indexed !== undefined) return indexed;
    if (overrides !== undefined && field in overrides) {
        return { column: { type: "string" }, sqlColumn: field };
    }
    throw new Exception(`TableView field "${field}" is not declared and was not supplied as an override`, {
        status: 500,
        code: "E_TABLE_VIEW_UNKNOWN_FIELD",
    });
}

/**
 * Map a parsed filter onto the Lucid query builder. Most ops are a direct `.where(col, op, val)`
 * — the substring ops (`like` / `ilike` family + `inc` / `iinc` for `%foo%`) wrap the value
 * before delegating. `between` / `in` / `nin` / null ops use Lucid's dedicated helpers.
 *
 * When `asOr` is true the same shape is dispatched via `.orWhere…` so the caller can group an
 * arbitrary number of OR clauses inside one `.where(q => …)` block.
 */
function applyFilterClause<Builder extends BasicQueryBuilder>(
    builder: Builder,
    sqlColumn: string,
    filter: TableViewFilter,
    asOr: boolean = false,
): void {
    const v = filter.value;

    switch (filter.op) {
        case "eq":
            asOr ? builder.orWhere(sqlColumn, "=", v as TableViewPrimitive) : builder.where(sqlColumn, "=", v as TableViewPrimitive);
            break;
        case "neq":
            asOr ? builder.orWhere(sqlColumn, "!=", v as TableViewPrimitive) : builder.where(sqlColumn, "!=", v as TableViewPrimitive);
            break;
        case "gt":
            asOr ? builder.orWhere(sqlColumn, ">", v as TableViewPrimitive) : builder.where(sqlColumn, ">", v as TableViewPrimitive);
            break;
        case "gte":
            asOr ? builder.orWhere(sqlColumn, ">=", v as TableViewPrimitive) : builder.where(sqlColumn, ">=", v as TableViewPrimitive);
            break;
        case "lt":
            asOr ? builder.orWhere(sqlColumn, "<", v as TableViewPrimitive) : builder.where(sqlColumn, "<", v as TableViewPrimitive);
            break;
        case "lte":
            asOr ? builder.orWhere(sqlColumn, "<=", v as TableViewPrimitive) : builder.where(sqlColumn, "<=", v as TableViewPrimitive);
            break;
        case "like":
            applyLikeOp(builder, sqlColumn, "LIKE", String(v), asOr);
            break;
        case "ilike":
            applyLikeOp(builder, sqlColumn, "ILIKE", String(v), asOr);
            break;
        case "nlike":
            applyLikeOp(builder, sqlColumn, "NOT LIKE", String(v), asOr);
            break;
        case "nilike":
            applyLikeOp(builder, sqlColumn, "NOT ILIKE", String(v), asOr);
            break;
        case "inc":
            applyLikeOp(builder, sqlColumn, "LIKE", `%${String(v)}%`, asOr);
            break;
        case "iinc":
            applyLikeOp(builder, sqlColumn, "ILIKE", `%${String(v)}%`, asOr);
            break;
        case "ninc":
            applyLikeOp(builder, sqlColumn, "NOT LIKE", `%${String(v)}%`, asOr);
            break;
        case "niinc":
            applyLikeOp(builder, sqlColumn, "NOT ILIKE", `%${String(v)}%`, asOr);
            break;
        case "in":
            asOr
                ? builder.orWhereIn(sqlColumn, v as ReadonlyArray<TableViewPrimitive>)
                : builder.whereIn(sqlColumn, v as ReadonlyArray<TableViewPrimitive>);
            break;
        case "nin":
            asOr
                ? builder.orWhereNotIn(sqlColumn, v as ReadonlyArray<TableViewPrimitive>)
                : builder.whereNotIn(sqlColumn, v as ReadonlyArray<TableViewPrimitive>);
            break;
        case "between": {
            const tuple = v as readonly [TableViewPrimitive, TableViewPrimitive];
            asOr ? builder.orWhereBetween(sqlColumn, [tuple[0], tuple[1]]) : builder.whereBetween(sqlColumn, [tuple[0], tuple[1]]);
            break;
        }
        case "isnull":
            asOr ? builder.orWhereNull(sqlColumn) : builder.whereNull(sqlColumn);
            break;
        case "notnull":
            asOr ? builder.orWhereNotNull(sqlColumn) : builder.whereNotNull(sqlColumn);
            break;
        default:
            assertExhaustive(filter.op);
    }
}

function applyLikeOp(builder: BasicQueryBuilder, col: string, op: string, value: string, asOr: boolean): void {
    if (asOr) builder.orWhere(col, op, value);
    else builder.where(col, op, value);
}

function applyRelationJoin<Model extends LucidModel>(
    builder: ModelQueryBuilderContract<Model, InstanceType<Model>>,
    model: Model,
    meta: { tableName: string; relation: RelationshipsContract },
): void {
    const relation = meta.relation;
    const localTable = model.table;
    const remoteTable = meta.tableName;

    if (relation.type === "belongsTo" || relation.type === "hasOne" || relation.type === "hasMany") {
        const localKey =
            relation.type === "belongsTo"
                ? (relation as unknown as { foreignKeyColumnName: string }).foreignKeyColumnName
                : (relation as unknown as { localKeyColumnName: string }).localKeyColumnName;
        const foreignKey =
            relation.type === "belongsTo"
                ? (relation as unknown as { localKeyColumnName: string }).localKeyColumnName
                : (relation as unknown as { foreignKeyColumnName: string }).foreignKeyColumnName;
        builder.join(remoteTable, `${remoteTable}.${foreignKey}`, "=", `${localTable}.${localKey}`);
        return;
    }

    throw new Exception(`TableView relation type "${relation.type}" is not supported in v1`, {
        status: 500,
        code: "E_TABLE_VIEW_UNSUPPORTED_RELATION",
    });
}

function assertExhaustive(op: TableViewOperator): never {
    throw new Exception(`TableView received unsupported operator "${op}"`, {
        status: 500,
        code: "E_TABLE_VIEW_UNSUPPORTED_OPERATOR",
    });
}

/**
 * Minimal subset of the Lucid query-builder surface that the clause applier needs. Typed loosely
 * so the same dispatcher can serve both the outer builder (a {@link ModelQueryBuilderContract})
 * and the nested callback builder we receive inside `.where(q => …)` (a `QueryClientContract` /
 * Knex query builder) — both implement the same surface for our purposes.
 */
interface BasicQueryBuilder {
    where(column: string, op: string, value: unknown): BasicQueryBuilder;
    orWhere(column: string, op: string, value: unknown): BasicQueryBuilder;
    whereIn(column: string, values: ReadonlyArray<unknown>): BasicQueryBuilder;
    orWhereIn(column: string, values: ReadonlyArray<unknown>): BasicQueryBuilder;
    whereNotIn(column: string, values: ReadonlyArray<unknown>): BasicQueryBuilder;
    orWhereNotIn(column: string, values: ReadonlyArray<unknown>): BasicQueryBuilder;
    whereBetween(column: string, values: readonly [unknown, unknown]): BasicQueryBuilder;
    orWhereBetween(column: string, values: readonly [unknown, unknown]): BasicQueryBuilder;
    whereNull(column: string): BasicQueryBuilder;
    orWhereNull(column: string): BasicQueryBuilder;
    whereNotNull(column: string): BasicQueryBuilder;
    orWhereNotNull(column: string): BasicQueryBuilder;
}
