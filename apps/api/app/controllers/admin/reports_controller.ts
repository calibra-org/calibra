import { Exception } from "@adonisjs/core/exceptions";
import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import { CacheKeys, CacheTags } from "#services/cache_keys";
import {
    type IntervalUnit,
    type PaginatedRows,
    type StockStatusFilter,
    computeCategoriesTable,
    computeCouponsTable,
    computeCouponsWindow,
    computeOrdersTable,
    computeProductsTable,
    computeSalesWindow,
    computeStockCounts,
    computeStockTable,
    computeTaxesTable,
    computeTopCategories,
    resolveInterval,
} from "#services/reports/analytics_service";
import {
    adminReportStatsValidator,
    adminReportTableValidator,
    adminStockReportValidator,
    adminTopCategoriesValidator,
    adminTopProductsValidator,
} from "#validators/admin/report_validator";

const DEFAULT_DAYS = 30;
const DEFAULT_LIMIT = 5;
const TABLE_PAGE_LIMIT = 25;
const CSV_ROW_CAP = 10_000;

interface TopProductRow {
    product_id: string | number;
    name: string;
    sku: string | null;
    units: string | number;
    revenue: string | number;
}

/**
 * Admin reports — narrow, dashboard-shaped aggregations powering the `/analytics` section. These do
 * not replace a full BI surface; they exist so the React Query hooks hit dedicated cached endpoints
 * instead of reaggregating raw order lists in the browser.
 *
 * Sales math lives in {@link "#services/reports/analytics_service"} so every report agrees on what
 * gross / net / total sales mean. Numeric returns are coerced into JS `number`s because pg's bigint
 * stringifies by default; the dashboard's revenue / unit numbers live well below 2^53.
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
        const locale = ctx.i18n.locale;

        return cache.getOrSet({
            key: CacheKeys.admin.topProducts(days, limit, locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports, CacheTags.catalogProducts],
            factory: () => this.computeTopProducts(days, limit, locale),
        });
    }

    /** Top categories by units sold over a trailing window — the Overview leaderboard sibling of {@link topProducts}. */
    async topCategories(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminTopCategoriesValidator);
        const days = payload.days ?? DEFAULT_DAYS;
        const limit = payload.limit ?? DEFAULT_LIMIT;
        const locale = ctx.i18n.locale;

        return cache.getOrSet({
            key: CacheKeys.admin.topCategories(days, limit, locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports, CacheTags.catalogProducts, CacheTags.catalogCategories],
            factory: () => computeTopCategories(days, limit, locale),
        });
    }

    /**
     * Windowed sales statistics — totals + a zero-filled interval series + an optional comparison
     * window. One endpoint backs the Overview, Revenue, Orders, Products, Categories, and Taxes
     * report tiles + charts: they all read the same overall-sales numbers, just different fields.
     */
    async salesStats(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminReportStatsValidator);
        const { from, to } = this.parseRange(payload.date_from, payload.date_to);
        const unit = resolveInterval(from, to, payload.interval ?? null);
        const compare = this.parseCompare(payload.compare_from, payload.compare_to);
        const locale = ctx.i18n.locale;

        return cache.getOrSet({
            key: CacheKeys.admin.report("sales-stats", this.statsKeyParams(payload, unit), locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports],
            factory: async () => {
                const current = await computeSalesWindow(from, to, unit);
                const comparison = compare ? await computeSalesWindow(compare.from, compare.to, unit) : null;
                return {
                    totals: current.totals,
                    intervals: current.intervals,
                    comparison: comparison ? { totals: comparison.totals, intervals: comparison.intervals } : null,
                    generated_at: DateTime.utc().toISO(),
                };
            },
        });
    }

    /** Coupon-usage statistics (discounted orders + amount) for the Coupons report tiles + chart. */
    async couponsStats(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminReportStatsValidator);
        const { from, to } = this.parseRange(payload.date_from, payload.date_to);
        const unit = resolveInterval(from, to, payload.interval ?? null);
        const compare = this.parseCompare(payload.compare_from, payload.compare_to);
        const locale = ctx.i18n.locale;

        return cache.getOrSet({
            key: CacheKeys.admin.report("coupons-stats", this.statsKeyParams(payload, unit), locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports],
            factory: async () => {
                const current = await computeCouponsWindow(from, to, unit);
                const comparison = compare ? await computeCouponsWindow(compare.from, compare.to, unit) : null;
                return {
                    totals: current.totals,
                    intervals: current.intervals,
                    comparison: comparison ? { totals: comparison.totals, intervals: comparison.intervals } : null,
                    generated_at: DateTime.utc().toISO(),
                };
            },
        });
    }

    /** Revenue table — one row per interval bucket, with a window totals footer. */
    async revenueTable(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminReportTableValidator);
        const { from, to } = this.parseRange(payload.date_from, payload.date_to);
        const unit = resolveInterval(from, to, payload.interval ?? null);
        const locale = ctx.i18n.locale;

        const compute = async () => {
            const win = await computeSalesWindow(from, to, unit);
            const rows = win.intervals.map((p) => ({
                date: p.date,
                orders: p.orders,
                gross_sales: p.gross_sales,
                returns: p.returns,
                coupons: p.coupons,
                net_sales: p.net_sales,
                taxes: p.taxes,
                shipping: p.shipping,
                total_sales: p.total_sales,
            }));
            return { rows, totals: win.totals };
        };

        if (payload.format === "csv") {
            const { rows } = await compute();
            return this.csv(ctx, "revenue-report", rows);
        }

        const result = await cache.getOrSet({
            key: CacheKeys.admin.report("revenue-table", this.tableKeyParams(payload, { unit }), locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports],
            factory: compute,
        });

        const page = payload.page ?? 1;
        const limit = payload.limit ?? TABLE_PAGE_LIMIT;
        const total = result.rows.length;
        const start = (page - 1) * limit;
        return {
            data: result.rows.slice(start, start + limit),
            meta: { page, limit, total, lastPage: Math.max(1, Math.ceil(total / limit)) },
            totals: result.totals,
        };
    }

    /** Orders table — one row per order (net of its refunds), classified new / returning / guest. */
    async ordersTable(ctx: HttpContext) {
        return this.runTable(ctx, "orders-table", ["date", "items_sold", "net_sales"], "date", (from, to, opts) =>
            computeOrdersTable(from, to, opts.orderBy as "date" | "items_sold" | "net_sales", opts.orderDir, opts.page, opts.limit),
        );
    }

    /** Products table — per-product units / net sales / orders, with category + stock context. */
    async productsTable(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminReportTableValidator);
        const { from, to } = this.parseRange(payload.date_from, payload.date_to);
        const locale = ctx.i18n.locale;
        const orderBy = this.pickSort(payload.order_by, ["items_sold", "net_sales", "orders"], "items_sold");
        const orderDir = payload.order_dir ?? "desc";

        const compute = (page: number, limit: number) =>
            computeProductsTable(from, to, { q: payload.q, categoryId: payload.category_id, orderBy: orderBy as "items_sold" | "net_sales" | "orders", orderDir, page, limit, locale });

        if (payload.format === "csv") {
            const result = await compute(1, CSV_ROW_CAP);
            return this.csv(ctx, "products-report", result.data as unknown as Record<string, unknown>[]);
        }
        return cache.getOrSet({
            key: CacheKeys.admin.report("products-table", this.tableKeyParams(payload, { orderBy, orderDir }), locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports, CacheTags.catalogProducts],
            factory: () => compute(payload.page ?? 1, payload.limit ?? TABLE_PAGE_LIMIT),
        });
    }

    /** Categories table — units / net sales / product count / orders rolled up through the category pivot. */
    async categoriesTable(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminReportTableValidator);
        const { from, to } = this.parseRange(payload.date_from, payload.date_to);
        const locale = ctx.i18n.locale;
        const orderBy = this.pickSort(payload.order_by, ["items_sold", "net_sales", "orders"], "items_sold");
        const orderDir = payload.order_dir ?? "desc";

        const compute = (page: number, limit: number) =>
            computeCategoriesTable(from, to, { orderBy: orderBy as "items_sold" | "net_sales" | "orders", orderDir, page, limit, locale });

        if (payload.format === "csv") {
            const result = await compute(1, CSV_ROW_CAP);
            return this.csv(ctx, "categories-report", result.data as unknown as Record<string, unknown>[]);
        }
        return cache.getOrSet({
            key: CacheKeys.admin.report("categories-table", this.tableKeyParams(payload, { orderBy, orderDir }), locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports, CacheTags.catalogProducts, CacheTags.catalogCategories],
            factory: () => compute(payload.page ?? 1, payload.limit ?? TABLE_PAGE_LIMIT),
        });
    }

    /** Coupons table — per-coupon order count + amount discounted, with created / expires / type. */
    async couponsTable(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminReportTableValidator);
        const { from, to } = this.parseRange(payload.date_from, payload.date_to);
        const locale = ctx.i18n.locale;
        const orderBy = this.pickSort(payload.order_by, ["orders", "amount", "code"], "amount");
        const orderDir = payload.order_dir ?? "desc";

        const compute = (page: number, limit: number) =>
            computeCouponsTable(from, to, { orderBy: orderBy as "orders" | "amount" | "code", orderDir, page, limit });

        if (payload.format === "csv") {
            const result = await compute(1, CSV_ROW_CAP);
            return this.csv(ctx, "coupons-report", result.data as unknown as Record<string, unknown>[]);
        }
        return cache.getOrSet({
            key: CacheKeys.admin.report("coupons-table", this.tableKeyParams(payload, { orderBy, orderDir }), locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports],
            factory: () => compute(payload.page ?? 1, payload.limit ?? TABLE_PAGE_LIMIT),
        });
    }

    /** Taxes table — per-rate total / order / shipping tax and the orders that contributed. */
    async taxesTable(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminReportTableValidator);
        const { from, to } = this.parseRange(payload.date_from, payload.date_to);
        const locale = ctx.i18n.locale;
        const orderBy = this.pickSort(payload.order_by, ["total_tax", "orders", "code"], "total_tax");
        const orderDir = payload.order_dir ?? "desc";

        const compute = (page: number, limit: number) =>
            computeTaxesTable(from, to, { orderBy: orderBy as "total_tax" | "orders" | "code", orderDir, page, limit });

        if (payload.format === "csv") {
            const result = await compute(1, CSV_ROW_CAP);
            return this.csv(ctx, "taxes-report", result.data as unknown as Record<string, unknown>[]);
        }
        return cache.getOrSet({
            key: CacheKeys.admin.report("taxes-table", this.tableKeyParams(payload, { orderBy, orderDir }), locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports],
            factory: () => compute(payload.page ?? 1, payload.limit ?? TABLE_PAGE_LIMIT),
        });
    }

    /**
     * Stock report — current snapshot (no date dimension) of every inventory item with a footer
     * count breakdown. Short TTL because operators expect near-live stock; never used as a checkout
     * stock check (that path is uncached).
     */
    async stockReport(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminStockReportValidator);
        const locale = ctx.i18n.locale;
        const status = this.parseStockStatus(payload.status);
        const orderBy = this.pickSort(payload.order_by, ["stock", "status", "name"], "name");
        const orderDir = payload.order_dir ?? "asc";

        const compute = (page: number, limit: number) =>
            computeStockTable({ status, q: payload.q, orderBy: orderBy as "stock" | "status" | "name", orderDir, page, limit, locale });

        if (payload.format === "csv") {
            const result = await compute(1, CSV_ROW_CAP);
            return this.csv(ctx, "stock-report", result.data as unknown as Record<string, unknown>[]);
        }
        return cache.getOrSet({
            key: CacheKeys.admin.report("stock-table", { status, q: payload.q ?? null, orderBy, orderDir, page: payload.page ?? 1, limit: payload.limit ?? TABLE_PAGE_LIMIT }, locale),
            ttl: "1m",
            grace: "30s",
            tags: [CacheTags.adminReports, CacheTags.catalogProducts],
            factory: async () => {
                const result = await compute(payload.page ?? 1, payload.limit ?? TABLE_PAGE_LIMIT);
                const counts = await computeStockCounts();
                return { data: result.data, meta: result.meta, counts };
            },
        });
    }

    /* ----------------------------- private helpers ----------------------------- */

    private async runTable(
        ctx: HttpContext,
        scope: string,
        sortable: string[],
        defaultSort: string,
        runner: (
            from: Date,
            to: Date,
            opts: { orderBy: string; orderDir: "asc" | "desc"; page: number; limit: number },
        ) => Promise<PaginatedRows<unknown>>,
    ) {
        const payload = await ctx.request.validateUsing(adminReportTableValidator);
        const { from, to } = this.parseRange(payload.date_from, payload.date_to);
        const locale = ctx.i18n.locale;
        const orderBy = this.pickSort(payload.order_by, sortable, defaultSort);
        const orderDir = payload.order_dir ?? "desc";

        if (payload.format === "csv") {
            const result = await runner(from, to, { orderBy, orderDir, page: 1, limit: CSV_ROW_CAP });
            return this.csv(ctx, scope, result.data as Record<string, unknown>[]);
        }
        return cache.getOrSet({
            key: CacheKeys.admin.report(scope, this.tableKeyParams(payload, { orderBy, orderDir }), locale),
            ttl: "5m",
            grace: "1h",
            tags: [CacheTags.adminReports],
            factory: () => runner(from, to, { orderBy, orderDir, page: payload.page ?? 1, limit: payload.limit ?? TABLE_PAGE_LIMIT }),
        });
    }

    private parseRange(fromStr: string, toStr: string): { from: Date; to: Date } {
        const from = new Date(fromStr);
        const to = new Date(toStr);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
            throw new Exception("Invalid date range", { status: 422, code: "E_INVALID_REPORT_RANGE" });
        }
        return { from, to };
    }

    private parseCompare(fromStr?: string, toStr?: string): { from: Date; to: Date } | null {
        if (fromStr === undefined || toStr === undefined) return null;
        const from = new Date(fromStr);
        const to = new Date(toStr);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
        return { from, to };
    }

    private parseStockStatus(value: unknown): StockStatusFilter {
        const allowed: StockStatusFilter[] = ["all", "instock", "outofstock", "onbackorder", "lowstock"];
        return allowed.includes(value as StockStatusFilter) ? (value as StockStatusFilter) : "all";
    }

    private pickSort(value: string | undefined, allowed: string[], fallback: string): string {
        return value !== undefined && allowed.includes(value) ? value : fallback;
    }

    private statsKeyParams(
        payload: { date_from: string; date_to: string; compare_from?: string; compare_to?: string },
        unit: IntervalUnit,
    ) {
        return { from: payload.date_from, to: payload.date_to, interval: unit, cf: payload.compare_from ?? null, ct: payload.compare_to ?? null };
    }

    private tableKeyParams(
        payload: { date_from?: string; date_to?: string; page?: number; limit?: number; q?: string; category_id?: number },
        extra: Record<string, unknown>,
    ) {
        return {
            from: payload.date_from ?? null,
            to: payload.date_to ?? null,
            page: payload.page ?? 1,
            limit: payload.limit ?? TABLE_PAGE_LIMIT,
            q: payload.q ?? null,
            categoryId: payload.category_id ?? null,
            ...extra,
        };
    }

    /** Serialize report rows to a CSV download. Array columns are joined with `;`; headers are the row keys. */
    private csv(ctx: HttpContext, name: string, rows: Record<string, unknown>[]) {
        const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
        const escape = (v: unknown): string => {
            const s = Array.isArray(v) ? v.join("; ") : v === null || v === undefined ? "" : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))];
        const body = `﻿${lines.join("\n")}`;
        ctx.response.header("Content-Type", "text/csv; charset=utf-8");
        ctx.response.header("Content-Disposition", `attachment; filename="${name}.csv"`);
        return body;
    }

    private async computeTopProducts(days: number, limit: number, locale: string) {
        const since = DateTime.utc().minus({ days }).toJSDate();
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
