import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import { adminTopProductsValidator } from "#validators/admin/report_validator";

const DEFAULT_DAYS = 30;
const DEFAULT_LIMIT = 5;

interface TopProductRow {
    product_id: string | number;
    name: string;
    sku: string | null;
    units: string | number;
    revenue: string | number;
}

/**
 * Admin reports — narrow, dashboard-shaped aggregations. These do not replace a full BI surface;
 * they exist so the React Query hooks on `/dashboard` can hit dedicated endpoints instead of
 * reaggregating raw order lists in the browser.
 *
 * Numeric returns are coerced into JS `number`s because pg's bigint stringifies by default and
 * the dashboard's revenue / unit numbers live well below 2^53.
 */
export default class AdminReportsController {
    /**
     * Ranks products by gross revenue over a trailing window. Only counts orders the merchant has
     * actually fulfilled or is fulfilling (`processing` + `completed`); refunded / cancelled /
     * failed / draft orders are excluded so the chart matches what hit the bank account.
     *
     * Name is resolved from `product_translations` for the request's locale, falling back to the
     * snapshot the order was placed with (so historical bestsellers still render even after the
     * product is renamed or deleted).
     */
    async topProducts(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminTopProductsValidator);
        const days = payload.days ?? DEFAULT_DAYS;
        const limit = payload.limit ?? DEFAULT_LIMIT;
        const since = DateTime.utc().minus({ days }).toJSDate();
        const locale = ctx.i18n.locale;

        const { rows } = await db.rawQuery<{ rows: TopProductRow[] }>(
            `
            WITH agg AS (
                SELECT
                    li.product_id,
                    SUM(li.quantity)::int AS units,
                    SUM(li.total)::bigint AS revenue,
                    MAX(li.name_snapshot) AS snapshot_name,
                    MAX(li.sku_snapshot) AS sku
                FROM order_line_items li
                INNER JOIN orders o ON o.id = li.order_id
                WHERE o.deleted_at IS NULL
                    AND o.status IN ('processing', 'completed')
                    AND o.created_at >= :since
                    AND li.product_id IS NOT NULL
                GROUP BY li.product_id
            )
            SELECT
                agg.product_id,
                COALESCE(pt.name, agg.snapshot_name) AS name,
                agg.sku,
                agg.units,
                agg.revenue
            FROM agg
            LEFT JOIN product_translations pt
                ON pt.product_id = agg.product_id AND pt.locale = :locale
            ORDER BY agg.revenue DESC, agg.product_id ASC
            LIMIT :limit
            `,
            { since, locale, limit },
        );

        return {
            data: rows.map((row) => ({
                product_id: Number(row.product_id),
                name: row.name ?? "",
                sku: row.sku,
                units: Number(row.units),
                revenue: Number(row.revenue),
            })),
            range: {
                start_date: since.toISOString().slice(0, 10),
                end_date: new Date().toISOString().slice(0, 10),
                days,
            },
        };
    }
}
