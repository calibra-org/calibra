import vine, { errors as vineErrors } from "@vinejs/vine";
import type { LucidModel } from "@adonisjs/lucid/types/model";
import type { SchemaTypes } from "@vinejs/vine/types";

import { TABLE_VIEW_DEFAULT_LIMIT, TABLE_VIEW_MAX_LIMIT } from "./constants.js";
import { buildFieldIndex, runTableView } from "./runtime.js";
import type { CompileStrictOptions, TableView, TableViewColumn, TableViewConfig } from "./types.js";
import { STRICT_KEYS_RULE_NAME, filterRule, sortRule } from "./validators.js";

/** The fixed top-level keys the TableView wire grammar accepts on every endpoint. */
const TABLE_VIEW_BASE_KEYS = ["page", "limit", "filter", "filterOr", "sort"] as const;

/**
 * Keys AdonisJS's `request.validateUsing()` injects into the data object alongside the raw
 * query / body fields. The strict-keys check skips these because none of them is a wire param
 * the operator could have sent — they're framework metadata the request handler bundles in.
 */
const ADONIS_INJECTED_KEYS = new Set<string>(["params", "headers", "cookies"]);

/**
 * Build a typed {@link TableView} from a config. The returned object exposes:
 *
 * - `schema` — a Vine schema you pass to `vine.compile(view.schema)` for the soft-validation
 *   case (kept for backwards compatibility — most callers should use `compileStrict` instead).
 * - `compileStrict({ extras, defaultLimit })` — the preferred entry point. Returns a fully
 *   compiled `VineValidator` that layers the endpoint's bespoke top-level params on top of the
 *   TableView grammar AND rejects unknown query keys with 422.
 * - `run(builder, parsed, overrides?)` — applies the parsed query against a pre-scoped Lucid
 *   builder and returns `{ data, meta }` matching the existing pagination envelope.
 * - `config` / `allowedFields` — read-only metadata for tooling (the Ace allowed-fields dumper
 *   and the OpenAPI generator).
 *
 * Pass `columns` `as const` if you want the literal-union type inference on
 * `InferTableViewQuery<typeof view>`. The wire field names are the keys of `columns`; the
 * SQL identifier defaults to the same string and can be overridden per-column with `column: "…"`.
 *
 * @example
 * export const adminOrdersView = createTableView({
 *     model: Order,
 *     columns: {
 *         id: { type: "bigint", filterable: true, orderable: true },
 *         status: { type: "enum", filterable: true, orderable: true, values: ORDER_STATUS_VALUES },
 *         created_at: { type: "datetime", filterable: true, orderable: true },
 *     },
 *     defaultSort: [["created_at", "desc"], ["id", "desc"]],
 * });
 *
 * export const validator = adminOrdersView.compileStrict({
 *     extras: {
 *         q: vine.string().trim().maxLength(120).optional(),
 *         trashed: vine.boolean().optional(),
 *     },
 * });
 *
 * // controller
 * const parsed = await ctx.request.validateUsing(validator);
 * const builder = Order.query().whereNull("orders.deleted_at").preload("lineItems");
 * const { data, meta } = await adminOrdersView.run(builder, parsed);
 */
export function createTableView<Model extends LucidModel, const Columns extends Record<string, TableViewColumn>>(
    config: TableViewConfig<Model, Columns>,
): TableView<Model, Columns> {
    const fieldIndex = buildFieldIndex(config);

    const filterableEntries = new Map<string, TableViewColumn>();
    const orderableEntries = new Set<string>();
    for (const [wireField, resolved] of fieldIndex.fields) {
        if (resolved.column.filterable !== false) filterableEntries.set(wireField, resolved.column);
        if (resolved.column.orderable !== false) orderableEntries.add(wireField);
    }

    /** Build the page/limit/filter/filterOr/sort properties shared by `schema` and any
     * `compileStrict` validator. The limit field's `.transform()` default can be overridden
     * per-endpoint via `compileStrict({ defaultLimit })`; everything else is fixed. */
    const buildBaseProperties = (defaultLimit: number) => ({
        page: vine.number().withoutDecimals().min(1).optional().transform((v) => v ?? 1),
        limit: vine
            .number()
            .withoutDecimals()
            .min(1)
            .max(TABLE_VIEW_MAX_LIMIT)
            .optional()
            .transform((v) => v ?? defaultLimit),
        filter: vine
            .any()
            .optional()
            .use(filterRule({ fields: filterableEntries })),
        filterOr: vine
            .any()
            .optional()
            .use(filterRule({ fields: filterableEntries })),
        sort: vine
            .any()
            .optional()
            .use(
                sortRule({
                    fields: orderableEntries,
                    defaultSort: config.defaultSort ?? [],
                }),
            ),
    });

    const schema = vine.object(buildBaseProperties(TABLE_VIEW_DEFAULT_LIMIT));

    const view: TableView<Model, Columns> = {
        config,
        schema: schema as unknown as TableView<Model, Columns>["schema"],
        async run(builder, parsed, options) {
            return runTableView(config, fieldIndex, builder, parsed as never, options);
        },
        compileStrict: (<Extras extends Record<string, SchemaTypes> = Record<string, never>>(
            options?: CompileStrictOptions<Extras>,
        ) => {
            const extras = (options?.extras ?? {}) as Record<string, SchemaTypes>;
            const defaultLimit = options?.defaultLimit ?? TABLE_VIEW_DEFAULT_LIMIT;
            const allowedKeys = new Set<string>([...TABLE_VIEW_BASE_KEYS, ...Object.keys(extras)]);
            const inner = vine.compile(
                vine.object({
                    ...buildBaseProperties(defaultLimit),
                    ...extras,
                }),
            );
            return wrapStrict(inner, allowedKeys, defaultLimit);
        }) as TableView<Model, Columns>["compileStrict"],
        allowedFields: {
            filterable: Array.from(filterableEntries.keys()).sort(),
            orderable: Array.from(orderableEntries).sort(),
        },
    };

    return view;
}

/**
 * Wrap a compiled vine validator with a pre-flight keys-allowlist check. Vine itself silently
 * drops unknown keys on `vine.object()` (no `.strict()` mode exists in v4), so we inspect the
 * raw input object before delegating. Any key not in the allowlist becomes a 422 with a
 * `table_view.unknown_query_key` rule code.
 *
 * The returned object is duck-typed against {@link import("@vinejs/vine").VineValidator} — the
 * surface `request.validateUsing()` actually invokes is just `.validate(data, options?)`, so
 * the cast at the boundary is sound. Callers retain full Vine type inference because the
 * underlying validator is real.
 */
// biome-ignore lint/suspicious/noExplicitAny: shape mirrors @vinejs/vine's internal VineValidator surface; the public types we expose at the TableView interface boundary carry the actual inference.
function wrapStrict(inner: any, allowedKeys: Set<string>, defaultLimit: number): any {
    const validate = async (data: unknown, ...rest: unknown[]) => {
        if (data !== null && data !== undefined && typeof data === "object" && !Array.isArray(data)) {
            const violations: Array<{ message: string; rule: string; field: string }> = [];
            for (const key of Object.keys(data as Record<string, unknown>)) {
                /** Skip the framework-injected siblings AdonisJS's `request.validateUsing()`
                 * bundles into the data object alongside the qs/body it gathered. None of these
                 * names is a legitimate wire-level query key. */
                if (ADONIS_INJECTED_KEYS.has(key)) continue;
                if (!allowedKeys.has(key)) {
                    violations.push({
                        message: `Unknown query parameter "${key}" — see /docs for the allowed list`,
                        rule: STRICT_KEYS_RULE_NAME,
                        field: key,
                    });
                }
            }
            if (violations.length > 0) throw new vineErrors.E_VALIDATION_ERROR(violations);
        }
        const result = await inner.validate(data, ...rest);
        /** Vine's `.optional().transform(fn)` skips the transform when the field is absent, so
         * `result.page` / `result.limit` can legitimately be `undefined`. Backfill them here so
         * `runTableView` receives a fully-shaped parsed query and the controller can read the
         * effective page size off the validated payload (e.g. for response headers). */
        if (result !== null && typeof result === "object") {
            const obj = result as { page?: number; limit?: number };
            if (typeof obj.page !== "number") obj.page = 1;
            if (typeof obj.limit !== "number") obj.limit = defaultLimit;
        }
        return result;
    };

    /** Return an object that mirrors VineValidator's public surface — preserve `schema`,
     * messagesProvider, and errorReporter so consumers that introspect the validator (e.g.
     * the OpenAPI dumper) still see the underlying schema. */
    return new Proxy(inner, {
        get(target, prop, receiver) {
            if (prop === "validate") return validate;
            return Reflect.get(target, prop, receiver);
        },
    });
}
