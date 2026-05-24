import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import type { AdminStatsRow } from "#transformers/customer_transformer";

/**
 * Orders that count toward a customer's lifetime metrics. Drafts and failed/cancelled orders
 * never contribute — they represent abandoned attempts, not customer activity. Refunded orders
 * still count toward `lifetime_spend` so we can show the gross relationship value (refunds get
 * surfaced as their own metric elsewhere).
 */
const ORDER_COUNTED_STATUSES = ["pending", "on_hold", "processing", "completed", "refunded"] as const;
const ORDER_PAID_STATUSES = ["processing", "completed", "refunded"] as const;

export interface CustomerStatsBundle extends AdminStatsRow {
    monthlySpendSeries: { month: string; amount_minor: number }[];
    favoriteProductId: number | null;
}

interface AggregateRow {
    customer_id: string | number;
    order_count: string | number | null;
    spend_minor: string | number | null;
    last_order_at: string | Date | null;
    first_order_at: string | Date | null;
}

/**
 * Aggregates lifetime order metrics across many customers in a single GROUP BY query. The list
 * controller calls this once per page so the per-row stats never go through an N+1 path.
 */
export async function aggregateForCustomerIds(customerIds: ReadonlyArray<number>): Promise<Map<number, AdminStatsRow>> {
    const result = new Map<number, AdminStatsRow>();
    if (customerIds.length === 0) return result;

    const countedPlaceholders = ORDER_COUNTED_STATUSES.map(() => "?").join(",");
    const paidPlaceholders = ORDER_PAID_STATUSES.map(() => "?").join(",");
    const idPlaceholders = customerIds.map(() => "?").join(",");

    const { rows } = await db.rawQuery<{ rows: AggregateRow[] }>(
        `SELECT
             customer_id,
             COUNT(*) FILTER (WHERE status IN (${countedPlaceholders})) AS order_count,
             COALESCE(SUM(grand_total) FILTER (WHERE status IN (${paidPlaceholders})), 0) AS spend_minor,
             MAX(created_at) FILTER (WHERE status IN (${countedPlaceholders})) AS last_order_at,
             MIN(created_at) FILTER (WHERE status IN (${countedPlaceholders})) AS first_order_at
         FROM orders
         WHERE customer_id IN (${idPlaceholders})
         GROUP BY customer_id`,
        [...ORDER_COUNTED_STATUSES, ...ORDER_PAID_STATUSES, ...ORDER_COUNTED_STATUSES, ...ORDER_COUNTED_STATUSES, ...customerIds],
    );

    const now = DateTime.utc();
    for (const row of rows) {
        const orderCount = Number(row.order_count ?? 0);
        const spendMinor = Number(row.spend_minor ?? 0);
        const lastOrderAt = row.last_order_at ? new Date(row.last_order_at).toISOString() : null;
        const firstOrderAt = row.first_order_at ? new Date(row.first_order_at).toISOString() : null;
        const daysSinceLastOrder =
            lastOrderAt === null ? null : Math.max(0, Math.floor(now.diff(DateTime.fromISO(lastOrderAt), "days").days));
        result.set(Number(row.customer_id), {
            lifetimeOrderCount: orderCount,
            lifetimeSpendMinor: spendMinor,
            averageOrderValueMinor: orderCount > 0 ? Math.round(spendMinor / orderCount) : 0,
            lastOrderAt,
            firstOrderAt,
            daysSinceLastOrder,
        });
    }

    for (const id of customerIds) {
        if (!result.has(id)) {
            result.set(id, {
                lifetimeOrderCount: 0,
                lifetimeSpendMinor: 0,
                averageOrderValueMinor: 0,
                lastOrderAt: null,
                firstOrderAt: null,
                daysSinceLastOrder: null,
            });
        }
    }
    return result;
}

interface SeriesRow {
    month: string;
    amount_minor: string | number | null;
}

interface FavoriteRow {
    product_id: string | number | null;
}

/**
 * Single-customer stats bundle — same row as the aggregate query plus a 12-month spend series
 * and a "favorite product" slot for the detail page sparkline + recommendation banner.
 */
export async function forSingleCustomer(customerId: number): Promise<CustomerStatsBundle> {
    const map = await aggregateForCustomerIds([customerId]);
    const stats = map.get(customerId) ?? {
        lifetimeOrderCount: 0,
        lifetimeSpendMinor: 0,
        averageOrderValueMinor: 0,
        lastOrderAt: null,
        firstOrderAt: null,
        daysSinceLastOrder: null,
    };

    const paidPlaceholders = ORDER_PAID_STATUSES.map(() => "?").join(",");
    const countedPlaceholders = ORDER_COUNTED_STATUSES.map(() => "?").join(",");

    const seriesResult = await db.rawQuery<{ rows: SeriesRow[] }>(
        `SELECT TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS month,
                COALESCE(SUM(grand_total), 0) AS amount_minor
         FROM orders
         WHERE customer_id = ?
           AND status IN (${paidPlaceholders})
           AND created_at >= date_trunc('month', now() - interval '11 months')
         GROUP BY date_trunc('month', created_at)
         ORDER BY date_trunc('month', created_at)`,
        [customerId, ...ORDER_PAID_STATUSES],
    );

    const favoriteResult = await db.rawQuery<{ rows: FavoriteRow[] }>(
        `SELECT oli.product_id
         FROM order_line_items oli
         JOIN orders o ON o.id = oli.order_id
         WHERE o.customer_id = ?
           AND o.status IN (${countedPlaceholders})
           AND oli.product_id IS NOT NULL
         GROUP BY oli.product_id
         ORDER BY SUM(oli.quantity) DESC
         LIMIT 1`,
        [customerId, ...ORDER_COUNTED_STATUSES],
    );

    return {
        ...stats,
        monthlySpendSeries: seriesResult.rows.map((r) => ({
            month: String(r.month),
            amount_minor: Number(r.amount_minor ?? 0),
        })),
        favoriteProductId: favoriteResult.rows[0]?.product_id ? Number(favoriteResult.rows[0].product_id) : null,
    };
}

export interface CustomerCounts {
    all: number;
    account_holders: number;
    guest: number;
    big_spenders: number;
    new_30d: number;
    inactive_180d: number;
    no_address: number;
    trashed: number;
    summary: {
        avg_order_count: number;
        avg_lifetime_spend_minor: number;
        avg_aov_minor: number;
        pct_with_account: number;
    };
}

interface TabRow {
    all_count: string | number;
    account_holders: string | number;
    guest_count: string | number;
    new_30d: string | number;
    trashed_count: string | number;
}

interface SummaryRow {
    avg_order_count: string | number;
    avg_lifetime_spend_minor: string | number;
    avg_aov_minor: string | number;
    pct_with_account: string | number;
}

interface ThresholdRow {
    threshold_minor: string | number;
}

interface CountRow {
    count: string | number;
}

/**
 * Tab counts + summary aggregates for the list page. Four counts come from one customers-only
 * query; three need to join orders and run as separate queries (parallelized). The big_spenders
 * threshold is the 90th percentile of per-customer spend across the whole base.
 */
export async function fetchCounts(): Promise<CustomerCounts> {
    const countedPlaceholders = ORDER_COUNTED_STATUSES.map(() => "?").join(",");
    const paidPlaceholders = ORDER_PAID_STATUSES.map(() => "?").join(",");

    const [tabResult, summaryResult, thresholdResult, inactiveResult, noAddressResult] = await Promise.all([
        db.rawQuery<{ rows: TabRow[] }>(
            `SELECT
                 COUNT(*) FILTER (WHERE deleted_at IS NULL) AS all_count,
                 COUNT(*) FILTER (WHERE deleted_at IS NULL AND user_id IS NOT NULL) AS account_holders,
                 COUNT(*) FILTER (WHERE deleted_at IS NULL AND user_id IS NULL) AS guest_count,
                 COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_at >= now() - interval '30 days') AS new_30d,
                 COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS trashed_count
             FROM customers`,
        ),
        db.rawQuery<{ rows: SummaryRow[] }>(
            `WITH stats AS (
                 SELECT c.id,
                        c.user_id,
                        COALESCE(o.order_count, 0) AS order_count,
                        COALESCE(o.spend_minor, 0) AS spend_minor
                 FROM customers c
                 LEFT JOIN (
                     SELECT customer_id,
                            COUNT(*) FILTER (WHERE status IN (${countedPlaceholders})) AS order_count,
                            COALESCE(SUM(grand_total) FILTER (WHERE status IN (${paidPlaceholders})), 0) AS spend_minor
                     FROM orders
                     GROUP BY customer_id
                 ) o ON o.customer_id = c.id
                 WHERE c.deleted_at IS NULL
             )
             SELECT
                 COALESCE(AVG(order_count), 0)::numeric AS avg_order_count,
                 COALESCE(AVG(spend_minor), 0)::numeric AS avg_lifetime_spend_minor,
                 CASE WHEN SUM(order_count) > 0
                      THEN SUM(spend_minor)::numeric / SUM(order_count)
                      ELSE 0 END AS avg_aov_minor,
                 CASE WHEN COUNT(*) > 0
                      THEN (COUNT(*) FILTER (WHERE user_id IS NOT NULL))::numeric / COUNT(*)
                      ELSE 0 END AS pct_with_account
             FROM stats`,
            [...ORDER_COUNTED_STATUSES, ...ORDER_PAID_STATUSES],
        ),
        db.rawQuery<{ rows: ThresholdRow[] }>(
            `SELECT COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY spend), 0) AS threshold_minor
             FROM (
                 SELECT COALESCE(SUM(grand_total), 0) AS spend
                 FROM orders
                 WHERE status IN (${paidPlaceholders})
                 GROUP BY customer_id
             ) spend_per_customer`,
            [...ORDER_PAID_STATUSES],
        ),
        db.rawQuery<{ rows: CountRow[] }>(
            `SELECT COUNT(*) AS count
             FROM customers c
             LEFT JOIN (
                 SELECT customer_id, MAX(created_at) AS last_order_at
                 FROM orders
                 WHERE status IN (${countedPlaceholders})
                 GROUP BY customer_id
             ) o ON o.customer_id = c.id
             WHERE c.deleted_at IS NULL
               AND (o.last_order_at IS NULL OR o.last_order_at < now() - interval '180 days')`,
            [...ORDER_COUNTED_STATUSES],
        ),
        db.rawQuery<{ rows: CountRow[] }>(
            `SELECT COUNT(*) AS count
             FROM customers c
             LEFT JOIN customer_addresses a ON a.customer_id = c.id
             WHERE c.deleted_at IS NULL AND a.id IS NULL`,
        ),
    ]);

    const threshold = Number(thresholdResult.rows[0]?.threshold_minor ?? 0);
    const bigSpendersResult =
        threshold > 0
            ? await db.rawQuery<{ rows: CountRow[] }>(
                  `SELECT COUNT(*) AS count
                   FROM (
                       SELECT customer_id, COALESCE(SUM(grand_total), 0) AS spend
                       FROM orders
                       WHERE status IN (${paidPlaceholders})
                       GROUP BY customer_id
                   ) spend_per_customer
                   JOIN customers c ON c.id = spend_per_customer.customer_id
                   WHERE c.deleted_at IS NULL AND spend_per_customer.spend >= ?`,
                  [...ORDER_PAID_STATUSES, threshold],
              )
            : { rows: [{ count: 0 }] };

    const tab = tabResult.rows[0];
    const summary = summaryResult.rows[0];

    return {
        all: Number(tab?.all_count ?? 0),
        account_holders: Number(tab?.account_holders ?? 0),
        guest: Number(tab?.guest_count ?? 0),
        big_spenders: Number(bigSpendersResult.rows[0]?.count ?? 0),
        new_30d: Number(tab?.new_30d ?? 0),
        inactive_180d: Number(inactiveResult.rows[0]?.count ?? 0),
        no_address: Number(noAddressResult.rows[0]?.count ?? 0),
        trashed: Number(tab?.trashed_count ?? 0),
        summary: {
            avg_order_count: Math.round(Number(summary?.avg_order_count ?? 0) * 100) / 100,
            avg_lifetime_spend_minor: Math.round(Number(summary?.avg_lifetime_spend_minor ?? 0)),
            avg_aov_minor: Math.round(Number(summary?.avg_aov_minor ?? 0)),
            pct_with_account: Math.round(Number(summary?.pct_with_account ?? 0) * 1000) / 10,
        },
    };
}
