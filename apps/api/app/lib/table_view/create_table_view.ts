import vine from "@vinejs/vine";
import type { LucidModel } from "@adonisjs/lucid/types/model";

import { TABLE_VIEW_DEFAULT_LIMIT, TABLE_VIEW_MAX_LIMIT } from "./constants.js";
import { buildFieldIndex, runTableView } from "./runtime.js";
import type { TableView, TableViewColumn, TableViewConfig } from "./types.js";
import { filterRule, sortRule } from "./validators.js";

/**
 * Build a typed {@link TableView} from a config. The returned object exposes:
 *
 * - `schema` — a Vine schema you pass to `vine.compile(view.schema)`.
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
 * export const validator = vine.compile(adminOrdersView.schema);
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

    const schema = vine.object({
        page: vine.number().withoutDecimals().min(1).optional().transform((v) => v ?? 1),
        limit: vine
            .number()
            .withoutDecimals()
            .min(1)
            .max(TABLE_VIEW_MAX_LIMIT)
            .optional()
            .transform((v) => v ?? TABLE_VIEW_DEFAULT_LIMIT),
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

    const view: TableView<Model, Columns> = {
        config,
        schema: schema as unknown as TableView<Model, Columns>["schema"],
        async run(builder, parsed, options) {
            return runTableView(config, fieldIndex, builder, parsed as never, options);
        },
        allowedFields: {
            filterable: Array.from(filterableEntries.keys()).sort(),
            orderable: Array.from(orderableEntries).sort(),
        },
    };

    return view;
}
