import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

/**
 * Cross-tenant business metrics for the control plane. These run on the `postgres_admin`
 * (BYPASSRLS) connection and aggregate across every tenant — the platform deliberately reads the
 * whole fleet, so there is NO tenant RLS context here (RULE A). The revenue/orders definitions
 * mirror the admin analytics service (`status IN ('processing','completed','refunded')`, amounts in
 * minor units, soft-deleted rows excluded) so a shop's control-plane figures match its own admin
 * dashboards — the only change is an explicit `tenant_id` filter / `GROUP BY tenant_id`.
 */

/**
 * Inlined SQL literal for the counted-status set — identical to the admin analytics service. Inlined
 * (not bound) on purpose: Knex doesn't expand a named array binding inside `IN (...)`. The values are
 * compile-time constants, never user input.
 */
const COUNTED_SQL = "('processing','completed','refunded')";

export type SeriesUnit = "day" | "week" | "month";

export interface HeadlineKpis {
    /** Realized orders in the window. */
    orders: number;
    /** Gross revenue (sum of `grand_total`) in the tenant's currency minor units. */
    revenue: number;
    /** Total bytes stored in the tenant's media library. */
    storageBytes: number;
}

export interface RevenueByCurrency {
    currencyCode: string;
    amount: number;
}

export interface FleetOverview {
    shops: { total: number; active: number; suspended: number; archived: number };
    /** GMV is reported per currency — the fleet spans currencies, so a single sum would be wrong. */
    revenue30d: RevenueByCurrency[];
    orders30d: number;
    customersTotal: number;
    storageBytes: number;
}

export interface TenantMetricsSeriesPoint {
    day: string;
    revenue: number;
    orders: number;
    newCustomers: number;
}

export interface TenantMetrics {
    range: { from: string; to: string; unit: SeriesUnit };
    currencyCode: string;
    kpis: {
        revenue: number;
        orders: number;
        customersNew: number;
        customersTotal: number;
        storageBytes: number;
    };
    series: TenantMetricsSeriesPoint[];
}

function admin() {
    return db.connection("postgres_admin");
}

export class FleetMetricsService {
    /** Fleet rollup for the console home: shop status counts, 30-day GMV (per currency), 30-day
     * order count, total customers, total stored bytes. */
    async overview(): Promise<FleetOverview> {
        const from = DateTime.utc().minus({ days: 30 }).toISO()!;

        const shopRows = (
            await admin().rawQuery(`SELECT status, COUNT(*)::bigint AS n FROM tenants WHERE deleted_at IS NULL GROUP BY status`)
        ).rows as Array<{ status: string; n: string }>;
        const shops = { total: 0, active: 0, suspended: 0, archived: 0 };
        for (const row of shopRows) {
            const n = Number(row.n);
            shops.total += n;
            if (row.status === "active") shops.active = n;
            else if (row.status === "suspended") shops.suspended = n;
            else if (row.status === "archived") shops.archived = n;
        }

        const revenueRows = (
            await admin().rawQuery(
                `SELECT currency, COALESCE(SUM(grand_total), 0)::bigint AS amount, COUNT(*)::bigint AS orders
                 FROM orders
                 WHERE deleted_at IS NULL AND status IN ${COUNTED_SQL} AND created_at >= :from
                 GROUP BY currency
                 ORDER BY amount DESC`,
                { from },
            )
        ).rows as Array<{ currency: string; amount: string; orders: string }>;

        const revenue30d = revenueRows.map((r) => ({ currencyCode: r.currency, amount: Number(r.amount) }));
        const orders30d = revenueRows.reduce((sum, r) => sum + Number(r.orders), 0);

        const customersTotal = Number(
            (await admin().rawQuery(`SELECT COUNT(*)::bigint AS n FROM customers WHERE deleted_at IS NULL`)).rows[0].n,
        );
        const storageBytes = Number(
            (await admin().rawQuery(`SELECT COALESCE(SUM(size_bytes), 0)::bigint AS n FROM media`)).rows[0].n,
        );

        return { shops, revenue30d, orders30d, customersTotal, storageBytes };
    }

    /**
     * Headline KPIs (orders + revenue over the last `sinceDays`, plus lifetime storage) for a set of
     * tenants — used to decorate the fleet list. Two grouped queries keyed by `tenant_id`, merged in
     * memory, so the list stays one round-trip per metric regardless of page size.
     */
    async headlineKpis(tenantIds: number[], sinceDays = 30): Promise<Map<number, HeadlineKpis>> {
        const out = new Map<number, HeadlineKpis>();
        if (tenantIds.length === 0) return out;
        for (const id of tenantIds) out.set(id, { orders: 0, revenue: 0, storageBytes: 0 });

        const from = DateTime.utc().minus({ days: sinceDays }).toISO()!;
        const orderRows = (
            await admin().rawQuery(
                `SELECT tenant_id, COUNT(*)::bigint AS orders, COALESCE(SUM(grand_total), 0)::bigint AS revenue
                 FROM orders
                 WHERE deleted_at IS NULL AND status IN ${COUNTED_SQL} AND created_at >= :from AND tenant_id = ANY(:ids)
                 GROUP BY tenant_id`,
                { from, ids: tenantIds },
            )
        ).rows as Array<{ tenant_id: string; orders: string; revenue: string }>;
        for (const row of orderRows) {
            const entry = out.get(Number(row.tenant_id));
            if (entry) {
                entry.orders = Number(row.orders);
                entry.revenue = Number(row.revenue);
            }
        }

        const storageRows = (
            await admin().rawQuery(
                `SELECT tenant_id, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
                 FROM media WHERE tenant_id = ANY(:ids) GROUP BY tenant_id`,
                { ids: tenantIds },
            )
        ).rows as Array<{ tenant_id: string; bytes: string }>;
        for (const row of storageRows) {
            const entry = out.get(Number(row.tenant_id));
            if (entry) entry.storageBytes = Number(row.bytes);
        }

        return out;
    }

    /**
     * Lifetime usage counters for a single tenant — the numbers shown against the plan limits on
     * the tenant detail screen. Counts exclude soft-deleted rows; storage is the live media sum.
     */
    async tenantUsageCounters(
        tenantId: number,
    ): Promise<{ products: number; ordersTotal: number; customersTotal: number; storageBytes: number }> {
        const count = async (sql: string) => Number((await admin().rawQuery(sql, { id: tenantId })).rows[0].n);
        const products = await count(`SELECT COUNT(*)::bigint AS n FROM products WHERE tenant_id = :id AND deleted_at IS NULL`);
        const ordersTotal = await count(`SELECT COUNT(*)::bigint AS n FROM orders WHERE tenant_id = :id AND deleted_at IS NULL`);
        const customersTotal = await count(
            `SELECT COUNT(*)::bigint AS n FROM customers WHERE tenant_id = :id AND deleted_at IS NULL`,
        );
        const storageBytes = await count(`SELECT COALESCE(SUM(size_bytes), 0)::bigint AS n FROM media WHERE tenant_id = :id`);
        return { products, ordersTotal, customersTotal, storageBytes };
    }

    /**
     * Per-tenant native metrics over a date range: headline KPIs plus a daily/weekly/monthly time
     * series of revenue, orders, and new customers. Mirrors the admin sales-series bucketing
     * (`date_trunc(unit, created_at)`) but scoped to one tenant on the admin connection.
     */
    async tenantMetrics(
        tenantId: number,
        from: DateTime,
        to: DateTime,
        unit: SeriesUnit,
        currencyCode: string,
    ): Promise<TenantMetrics> {
        const fromIso = from.toISO()!;
        const toIso = to.toISO()!;
        const step = unit === "day" ? "1 day" : unit === "week" ? "1 week" : "1 month";

        const totals = (
            await admin().rawQuery(
                `SELECT COUNT(*)::bigint AS orders, COALESCE(SUM(grand_total), 0)::bigint AS revenue
                 FROM orders
                 WHERE deleted_at IS NULL AND status IN ${COUNTED_SQL}
                   AND tenant_id = :tenantId AND created_at >= :from AND created_at <= :to`,
                { tenantId, from: fromIso, to: toIso },
            )
        ).rows[0] as { orders: string; revenue: string };

        const customersNew = Number(
            (
                await admin().rawQuery(
                    `SELECT COUNT(*)::bigint AS n FROM customers
                     WHERE deleted_at IS NULL AND tenant_id = :tenantId AND created_at >= :from AND created_at <= :to`,
                    { tenantId, from: fromIso, to: toIso },
                )
            ).rows[0].n,
        );
        const customersTotal = Number(
            (
                await admin().rawQuery(
                    `SELECT COUNT(*)::bigint AS n FROM customers WHERE deleted_at IS NULL AND tenant_id = :tenantId`,
                    { tenantId },
                )
            ).rows[0].n,
        );
        const storageBytes = Number(
            (
                await admin().rawQuery(
                    `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS n FROM media WHERE tenant_id = :tenantId`,
                    { tenantId },
                )
            ).rows[0].n,
        );

        /**
         * Left-join the order/customer aggregates onto a dense `generate_series` of buckets so the
         * series has a row for every period even when nothing happened — the chart draws a flat
         * segment instead of collapsing the gap.
         */
        const seriesRows = (
            await admin().rawQuery(
                `WITH buckets AS (
                     SELECT generate_series(date_trunc(:unit, :from::timestamptz),
                                            date_trunc(:unit, :to::timestamptz),
                                            :step::interval) AS bucket
                 ),
                 sales AS (
                     SELECT date_trunc(:unit, created_at) AS bucket,
                            COUNT(*)::bigint AS orders,
                            COALESCE(SUM(grand_total), 0)::bigint AS revenue
                     FROM orders
                     WHERE deleted_at IS NULL AND status IN ${COUNTED_SQL}
                       AND tenant_id = :tenantId AND created_at >= :from AND created_at <= :to
                     GROUP BY 1
                 ),
                 newcust AS (
                     SELECT date_trunc(:unit, created_at) AS bucket, COUNT(*)::bigint AS n
                     FROM customers
                     WHERE deleted_at IS NULL AND tenant_id = :tenantId AND created_at >= :from AND created_at <= :to
                     GROUP BY 1
                 )
                 SELECT b.bucket::date AS day,
                        COALESCE(s.revenue, 0)::bigint AS revenue,
                        COALESCE(s.orders, 0)::bigint AS orders,
                        COALESCE(c.n, 0)::bigint AS new_customers
                 FROM buckets b
                 LEFT JOIN sales s ON s.bucket = b.bucket
                 LEFT JOIN newcust c ON c.bucket = b.bucket
                 ORDER BY b.bucket ASC`,
                { unit, step, tenantId, from: fromIso, to: toIso },
            )
        ).rows as Array<{ day: string | Date; revenue: string; orders: string; new_customers: string }>;

        const series: TenantMetricsSeriesPoint[] = seriesRows.map((r) => ({
            day: typeof r.day === "string" ? r.day : DateTime.fromJSDate(r.day as Date).toISODate()!,
            revenue: Number(r.revenue),
            orders: Number(r.orders),
            newCustomers: Number(r.new_customers),
        }));

        return {
            range: { from: fromIso, to: toIso, unit },
            currencyCode,
            kpis: {
                revenue: Number(totals.revenue),
                orders: Number(totals.orders),
                customersNew,
                customersTotal,
                storageBytes,
            },
            series,
        };
    }
}

export default FleetMetricsService;
