import db from "@adonisjs/lucid/services/db";

/**
 * Analytics aggregation service — the single source of truth for the sales math behind every
 * `/api/v1/admin/reports/*` endpoint. Centralising the formulas here is the load-bearing
 * guarantee that the Overview tiles, the Revenue table, and the Orders chart can never disagree
 * about what "net sales" means.
 *
 * **Counted statuses.** Only orders the merchant actually billed contribute to sales figures:
 * `processing`, `completed`, and `refunded`. A refunded order still represents a sale that
 * happened — the money that came back is surfaced separately as `returns`, never by dropping the
 * order. Drafts, pending, on-hold, cancelled, and failed orders never count.
 *
 * **Sales definitions** (Rial minor units, integer end-to-end):
 * - `gross_sales`  = Σ line_item.subtotal              (price × qty, pre-coupon, pre-tax, pre-refund)
 * - `coupons`      = Σ order.discount_total            (coupon discount on goods)
 * - `returns`      = Σ refund.amount_minor             (bucketed by refund.processed_at, not order date)
 * - `taxes`        = Σ order.tax_total − Σ refund.tax_amount_minor
 * - `shipping`     = Σ order.shipping_total
 * - `total_sales`  = Σ order.grand_total − returns     (all-in revenue net of refunds)
 * - `net_sales`    = total_sales − taxes − shipping    (goods revenue; excludes tax + shipping)
 *
 * Sales metrics bucket by `orders.created_at`; refunds bucket by `order_refunds.processed_at`, so
 * a May refund of an April order lands in May's returns. This matches WooCommerce's revenue model.
 */

/** Order statuses that contribute to every sales figure. */
export const REPORT_COUNTED_STATUSES = ["processing", "completed", "refunded"] as const;

/** Inlined SQL literal for the counted-status set. Values are compile-time constants, never user input. */
const COUNTED_SQL = "('processing','completed','refunded')";

export type IntervalUnit = "day" | "week" | "month";

const INTERVAL_STEP: Record<IntervalUnit, string> = {
    day: "1 day",
    week: "1 week",
    month: "1 month",
};

/**
 * Pick a sensible bucket granularity for a window when the operator hasn't forced one: daily up to
 * a month, weekly up to half a year, monthly beyond. Keeps the chart readable instead of rendering
 * 365 daily ticks for a year-long range.
 */
export function resolveInterval(from: Date, to: Date, requested?: IntervalUnit | null): IntervalUnit {
    if (requested === "day" || requested === "week" || requested === "month") return requested;
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
    if (days <= 31) return "day";
    if (days <= 180) return "week";
    return "month";
}

export interface SalesTotals {
    gross_sales: number;
    net_sales: number;
    total_sales: number;
    coupons: number;
    returns: number;
    taxes: number;
    order_tax: number;
    shipping_tax: number;
    shipping: number;
    orders: number;
    items_sold: number;
    variations_sold: number;
    products_sold: number;
    avg_order_value: number;
    avg_items_per_order: number;
}

export interface SalesIntervalPoint {
    date: string;
    orders: number;
    gross_sales: number;
    net_sales: number;
    total_sales: number;
    taxes: number;
    shipping: number;
    coupons: number;
    returns: number;
    items_sold: number;
}

export interface SalesWindow {
    totals: SalesTotals;
    intervals: SalesIntervalPoint[];
}

interface RawSalesRow {
    orders: string | number;
    gross_sales: string | number;
    items_sold: string | number;
    variations_sold: string | number;
    coupons: string | number;
    returns_total: string | number;
    returns_tax: string | number;
    gross_taxes: string | number;
    shipping_tax: string | number;
    shipping: string | number;
    gross_grand: string | number;
}

const n = (v: string | number | null | undefined): number => Number(v ?? 0);

/** Derive the published totals from one raw aggregate row (totals or a single interval bucket). */
function deriveTotals(row: RawSalesRow): SalesTotals {
    const grossSales = n(row.gross_sales);
    const coupons = n(row.coupons);
    const returns = n(row.returns_total);
    const returnsTax = n(row.returns_tax);
    const taxes = n(row.gross_taxes) - returnsTax;
    const shippingTax = n(row.shipping_tax);
    const shipping = n(row.shipping);
    const totalSales = n(row.gross_grand) - returns;
    const netSales = totalSales - taxes - shipping;
    const orders = n(row.orders);
    const itemsSold = n(row.items_sold);
    return {
        gross_sales: grossSales,
        net_sales: netSales,
        total_sales: totalSales,
        coupons,
        returns,
        taxes,
        order_tax: taxes - shippingTax,
        shipping_tax: shippingTax,
        shipping,
        orders,
        items_sold: itemsSold,
        variations_sold: n(row.variations_sold),
        products_sold: itemsSold,
        avg_order_value: orders > 0 ? Math.round(netSales / orders) : 0,
        avg_items_per_order: orders > 0 ? Math.round((itemsSold / orders) * 100) / 100 : 0,
    };
}

/**
 * Compute the full sales picture for a window: a totals row plus a zero-filled interval series.
 * Every overall report (performance, revenue, orders, products/categories stats) reads its slice
 * of fields off this one result, so they cannot drift apart.
 */
export async function computeSalesWindow(from: Date, to: Date, unit: IntervalUnit): Promise<SalesWindow> {
    const totalsResult = await db.rawQuery<{ rows: RawSalesRow[] }>(
        `
        WITH win_orders AS (
            SELECT id, grand_total, tax_total, shipping_total, shipping_tax_total, discount_total
            FROM orders
            WHERE deleted_at IS NULL AND status IN ${COUNTED_SQL}
              AND created_at >= :from AND created_at <= :to
        ),
        gross AS (
            SELECT
                COALESCE(SUM(li.subtotal), 0) AS gross_sales,
                COALESCE(SUM(li.quantity), 0) AS items_sold,
                COALESCE(SUM(li.quantity) FILTER (WHERE li.variation_id IS NOT NULL), 0) AS variations_sold
            FROM order_line_items li
            INNER JOIN win_orders w ON w.id = li.order_id
        ),
        ref AS (
            SELECT
                COALESCE(SUM(r.amount_minor), 0) AS returns_total,
                COALESCE(SUM(r.tax_amount_minor), 0) AS returns_tax
            FROM order_refunds r
            INNER JOIN orders o ON o.id = r.order_id
            WHERE o.deleted_at IS NULL AND r.processed_at >= :from AND r.processed_at <= :to
        )
        SELECT
            (SELECT COUNT(*) FROM win_orders) AS orders,
            (SELECT gross_sales FROM gross) AS gross_sales,
            (SELECT items_sold FROM gross) AS items_sold,
            (SELECT variations_sold FROM gross) AS variations_sold,
            COALESCE((SELECT SUM(discount_total) FROM win_orders), 0) AS coupons,
            (SELECT returns_total FROM ref) AS returns_total,
            (SELECT returns_tax FROM ref) AS returns_tax,
            COALESCE((SELECT SUM(tax_total) FROM win_orders), 0) AS gross_taxes,
            COALESCE((SELECT SUM(shipping_tax_total) FROM win_orders), 0) AS shipping_tax,
            COALESCE((SELECT SUM(shipping_total) FROM win_orders), 0) AS shipping,
            COALESCE((SELECT SUM(grand_total) FROM win_orders), 0) AS gross_grand
        `,
        { from, to },
    );

    const intervalsResult = await db.rawQuery<{ rows: (RawSalesRow & { bucket: string | Date })[] }>(
        `
        WITH buckets AS (
            SELECT date_trunc(:unit, gs)::date AS bucket
            FROM generate_series(date_trunc(:unit, :from::timestamptz), :to::timestamptz, :step::interval) gs
        ),
        ord AS (
            SELECT date_trunc(:unit, created_at)::date AS bucket,
                   COUNT(*) AS orders,
                   COALESCE(SUM(grand_total), 0) AS gross_grand,
                   COALESCE(SUM(tax_total), 0) AS gross_taxes,
                   COALESCE(SUM(shipping_tax_total), 0) AS shipping_tax,
                   COALESCE(SUM(shipping_total), 0) AS shipping,
                   COALESCE(SUM(discount_total), 0) AS coupons
            FROM orders
            WHERE deleted_at IS NULL AND status IN ${COUNTED_SQL}
              AND created_at >= :from AND created_at <= :to
            GROUP BY 1
        ),
        li AS (
            SELECT date_trunc(:unit, o.created_at)::date AS bucket,
                   COALESCE(SUM(l.subtotal), 0) AS gross_sales,
                   COALESCE(SUM(l.quantity), 0) AS items_sold,
                   COALESCE(SUM(l.quantity) FILTER (WHERE l.variation_id IS NOT NULL), 0) AS variations_sold
            FROM order_line_items l
            INNER JOIN orders o ON o.id = l.order_id
            WHERE o.deleted_at IS NULL AND o.status IN ${COUNTED_SQL}
              AND o.created_at >= :from AND o.created_at <= :to
            GROUP BY 1
        ),
        ref AS (
            SELECT date_trunc(:unit, r.processed_at)::date AS bucket,
                   COALESCE(SUM(r.amount_minor), 0) AS returns_total,
                   COALESCE(SUM(r.tax_amount_minor), 0) AS returns_tax
            FROM order_refunds r
            INNER JOIN orders o ON o.id = r.order_id
            WHERE o.deleted_at IS NULL AND r.processed_at >= :from AND r.processed_at <= :to
            GROUP BY 1
        )
        SELECT b.bucket,
            COALESCE(ord.orders, 0) AS orders,
            COALESCE(li.gross_sales, 0) AS gross_sales,
            COALESCE(li.items_sold, 0) AS items_sold,
            COALESCE(li.variations_sold, 0) AS variations_sold,
            COALESCE(ord.coupons, 0) AS coupons,
            COALESCE(ref.returns_total, 0) AS returns_total,
            COALESCE(ref.returns_tax, 0) AS returns_tax,
            COALESCE(ord.gross_taxes, 0) AS gross_taxes,
            COALESCE(ord.shipping_tax, 0) AS shipping_tax,
            COALESCE(ord.shipping, 0) AS shipping,
            COALESCE(ord.gross_grand, 0) AS gross_grand
        FROM buckets b
        LEFT JOIN ord ON ord.bucket = b.bucket
        LEFT JOIN li ON li.bucket = b.bucket
        LEFT JOIN ref ON ref.bucket = b.bucket
        ORDER BY b.bucket
        `,
        { from, to, unit, step: INTERVAL_STEP[unit] },
    );

    const totals = deriveTotals(totalsResult.rows[0] ?? ({} as RawSalesRow));
    const intervals: SalesIntervalPoint[] = intervalsResult.rows.map((row) => {
        const t = deriveTotals(row);
        return {
            date: toIsoDate(row.bucket),
            orders: t.orders,
            gross_sales: t.gross_sales,
            net_sales: t.net_sales,
            total_sales: t.total_sales,
            taxes: t.taxes,
            shipping: t.shipping,
            coupons: t.coupons,
            returns: t.returns,
            items_sold: t.items_sold,
        };
    });

    return { totals, intervals };
}

export interface CouponsTotals {
    discounted_orders: number;
    amount: number;
}

export interface CouponsIntervalPoint {
    date: string;
    discounted_orders: number;
    amount: number;
}

export interface CouponsWindow {
    totals: CouponsTotals;
    intervals: CouponsIntervalPoint[];
}

/** Coupon usage for a window: count of orders carrying ≥1 coupon and the total discount applied. */
export async function computeCouponsWindow(from: Date, to: Date, unit: IntervalUnit): Promise<CouponsWindow> {
    const totalsResult = await db.rawQuery<{ rows: { discounted_orders: string | number; amount: string | number }[] }>(
        `
        SELECT
            COUNT(DISTINCT o.id) AS discounted_orders,
            COALESCE(SUM(cl.discount), 0) AS amount
        FROM order_coupon_lines cl
        INNER JOIN orders o ON o.id = cl.order_id
        WHERE o.deleted_at IS NULL AND o.status IN ${COUNTED_SQL}
          AND o.created_at >= :from AND o.created_at <= :to
        `,
        { from, to },
    );

    const intervalsResult = await db.rawQuery<{ rows: { bucket: string | Date; discounted_orders: string | number; amount: string | number }[] }>(
        `
        WITH buckets AS (
            SELECT date_trunc(:unit, gs)::date AS bucket
            FROM generate_series(date_trunc(:unit, :from::timestamptz), :to::timestamptz, :step::interval) gs
        ),
        agg AS (
            SELECT date_trunc(:unit, o.created_at)::date AS bucket,
                   COUNT(DISTINCT o.id) AS discounted_orders,
                   COALESCE(SUM(cl.discount), 0) AS amount
            FROM order_coupon_lines cl
            INNER JOIN orders o ON o.id = cl.order_id
            WHERE o.deleted_at IS NULL AND o.status IN ${COUNTED_SQL}
              AND o.created_at >= :from AND o.created_at <= :to
            GROUP BY 1
        )
        SELECT b.bucket,
            COALESCE(agg.discounted_orders, 0) AS discounted_orders,
            COALESCE(agg.amount, 0) AS amount
        FROM buckets b
        LEFT JOIN agg ON agg.bucket = b.bucket
        ORDER BY b.bucket
        `,
        { from, to, unit, step: INTERVAL_STEP[unit] },
    );

    return {
        totals: {
            discounted_orders: n(totalsResult.rows[0]?.discounted_orders),
            amount: n(totalsResult.rows[0]?.amount),
        },
        intervals: intervalsResult.rows.map((row) => ({
            date: toIsoDate(row.bucket),
            discounted_orders: n(row.discounted_orders),
            amount: n(row.amount),
        })),
    };
}

/* ----------------------------- table (detail row) computes ----------------------------- */

export interface PaginatedRows<T> {
    data: T[];
    meta: { page: number; limit: number; total: number; lastPage: number };
}

function paginate<T>(rows: T[], page: number, limit: number): PaginatedRows<T> {
    const total = rows.length;
    const lastPage = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    return { data: rows.slice(start, start + limit), meta: { page, limit, total, lastPage } };
}

export interface OrdersReportRow {
    order_id: number;
    order_number: number;
    date: string;
    status: string;
    customer: string | null;
    customer_type: "new" | "returning" | "guest";
    products: string[];
    items_sold: number;
    coupons: string[];
    net_sales: number;
    is_refunded: boolean;
}

interface RawOrderRow {
    order_id: string | number;
    order_number: string | number;
    created_at: string | Date;
    status: string;
    customer_id: string | number | null;
    billing_email: string | null;
    items_total: string | number;
    refund_goods: string | number;
    items_sold: string | number;
    products: string[] | null;
    coupons: string[] | null;
    is_first_order: boolean;
}

/** One row per order in the window, net of that order's refunds, with new/returning classification. */
export async function computeOrdersTable(
    from: Date,
    to: Date,
    orderBy: "date" | "items_sold" | "net_sales",
    orderDir: "asc" | "desc",
    page: number,
    limit: number,
): Promise<PaginatedRows<OrdersReportRow>> {
    const { rows } = await db.rawQuery<{ rows: RawOrderRow[] }>(
        `
        SELECT
            o.id AS order_id,
            o.order_number,
            o.created_at,
            o.status,
            o.customer_id,
            o.billing_email,
            o.items_total,
            COALESCE((SELECT SUM(r.amount_minor - r.tax_amount_minor) FROM order_refunds r WHERE r.order_id = o.id), 0) AS refund_goods,
            COALESCE((SELECT SUM(l.quantity) FROM order_line_items l WHERE l.order_id = o.id), 0) AS items_sold,
            (SELECT array_agg(l.name_snapshot ORDER BY l.id) FROM order_line_items l WHERE l.order_id = o.id) AS products,
            (SELECT array_agg(cl.code_snapshot ORDER BY cl.id) FROM order_coupon_lines cl WHERE cl.order_id = o.id) AS coupons,
            (o.customer_id IS NULL OR o.created_at = (
                SELECT MIN(o2.created_at) FROM orders o2
                WHERE o2.customer_id = o.customer_id AND o2.deleted_at IS NULL AND o2.status IN ${COUNTED_SQL}
            )) AS is_first_order
        FROM orders o
        WHERE o.deleted_at IS NULL AND o.status IN ${COUNTED_SQL}
          AND o.created_at >= :from AND o.created_at <= :to
        `,
        { from, to },
    );

    const mapped: OrdersReportRow[] = rows.map((row) => {
        const netSales = n(row.items_total) - n(row.refund_goods);
        const customerType: OrdersReportRow["customer_type"] =
            row.customer_id === null ? "guest" : row.is_first_order ? "new" : "returning";
        return {
            order_id: Number(row.order_id),
            order_number: Number(row.order_number),
            date: toIso(row.created_at),
            status: row.status,
            customer: row.billing_email,
            customer_type: customerType,
            products: row.products ?? [],
            items_sold: n(row.items_sold),
            coupons: row.coupons ?? [],
            net_sales: netSales,
            is_refunded: row.status === "refunded" || n(row.refund_goods) > 0,
        };
    });

    sortRows(mapped, orderBy === "date" ? "date" : orderBy, orderDir);
    return paginate(mapped, page, limit);
}

export interface ProductsReportRow {
    product_id: number;
    name: string;
    sku: string | null;
    items_sold: number;
    net_sales: number;
    orders: number;
    categories: string[];
    variations: number;
    status: string | null;
    stock: number | null;
}

export async function computeProductsTable(
    from: Date,
    to: Date,
    opts: { q?: string; categoryId?: number; orderBy: "items_sold" | "net_sales" | "orders"; orderDir: "asc" | "desc"; page: number; limit: number; locale: string },
): Promise<PaginatedRows<ProductsReportRow>> {
    const { rows } = await db.rawQuery<{ rows: Record<string, unknown>[] }>(
        `
        WITH agg AS (
            SELECT li.product_id,
                   SUM(li.quantity)::bigint AS items_sold,
                   SUM(li.total)::bigint AS net_sales,
                   COUNT(DISTINCT li.order_id)::bigint AS orders,
                   MAX(li.name_snapshot) AS snapshot_name
            FROM order_line_items li
            INNER JOIN orders o ON o.id = li.order_id
            WHERE o.deleted_at IS NULL AND o.status IN ${COUNTED_SQL}
              AND o.created_at >= :from AND o.created_at <= :to
              AND li.product_id IS NOT NULL
            GROUP BY li.product_id
        )
        SELECT
            agg.product_id,
            COALESCE(pt.name, agg.snapshot_name) AS name,
            p.sku,
            p.status,
            agg.items_sold,
            agg.net_sales,
            agg.orders,
            COALESCE((SELECT array_agg(COALESCE(ct.name, '')) FROM product_category_links pcl
                JOIN product_categories pc ON pc.id = pcl.category_id
                LEFT JOIN product_category_translations ct ON ct.category_id = pc.id AND ct.locale = :locale
                WHERE pcl.product_id = agg.product_id), ARRAY[]::text[]) AS categories,
            COALESCE((SELECT COUNT(*) FROM product_variations v WHERE v.product_id = agg.product_id), 0) AS variations,
            (SELECT COALESCE(SUM(stock_quantity), 0) FROM inventory_items ii WHERE ii.product_id = agg.product_id) AS stock,
            EXISTS (SELECT 1 FROM product_category_links pcl2 WHERE pcl2.product_id = agg.product_id AND (:categoryId::bigint IS NULL OR pcl2.category_id = :categoryId)) AS in_category
        FROM agg
        LEFT JOIN products p ON p.id = agg.product_id
        LEFT JOIN product_translations pt ON pt.product_id = agg.product_id AND pt.locale = :locale
        WHERE (:q::text IS NULL OR COALESCE(pt.name, agg.snapshot_name) ILIKE :qlike OR p.sku ILIKE :qlike)
          AND (:categoryId::bigint IS NULL OR EXISTS (
              SELECT 1 FROM product_category_links pcl3 WHERE pcl3.product_id = agg.product_id AND pcl3.category_id = :categoryId
          ))
        `,
        {
            from,
            to,
            locale: opts.locale,
            q: opts.q ?? null,
            qlike: opts.q ? `%${opts.q}%` : "%",
            categoryId: opts.categoryId ?? null,
        },
    );

    const mapped: ProductsReportRow[] = rows.map((row) => ({
        product_id: Number(row.product_id),
        name: (row.name as string) ?? "",
        sku: (row.sku as string | null) ?? null,
        items_sold: n(row.items_sold as number),
        net_sales: n(row.net_sales as number),
        orders: n(row.orders as number),
        categories: ((row.categories as string[] | null) ?? []).filter((c) => c.length > 0),
        variations: n(row.variations as number),
        status: (row.status as string | null) ?? null,
        stock: row.stock === null ? null : n(row.stock as number),
    }));

    sortRows(mapped, opts.orderBy, opts.orderDir);
    return paginate(mapped, opts.page, opts.limit);
}

export interface CategoriesReportRow {
    category_id: number;
    name: string;
    items_sold: number;
    net_sales: number;
    products: number;
    orders: number;
}

export async function computeCategoriesTable(
    from: Date,
    to: Date,
    opts: { orderBy: "items_sold" | "net_sales" | "orders"; orderDir: "asc" | "desc"; page: number; limit: number; locale: string },
): Promise<PaginatedRows<CategoriesReportRow>> {
    const { rows } = await db.rawQuery<{ rows: Record<string, unknown>[] }>(
        `
        SELECT
            pc.id AS category_id,
            COALESCE(ct.name, '') AS name,
            COALESCE(SUM(li.quantity), 0) AS items_sold,
            COALESCE(SUM(li.total), 0) AS net_sales,
            COUNT(DISTINCT li.product_id) AS products,
            COUNT(DISTINCT li.order_id) AS orders
        FROM product_categories pc
        LEFT JOIN product_category_translations ct ON ct.category_id = pc.id AND ct.locale = :locale
        INNER JOIN product_category_links pcl ON pcl.category_id = pc.id
        INNER JOIN order_line_items li ON li.product_id = pcl.product_id
        INNER JOIN orders o ON o.id = li.order_id
        WHERE o.deleted_at IS NULL AND o.status IN ${COUNTED_SQL}
          AND o.created_at >= :from AND o.created_at <= :to
        GROUP BY pc.id, ct.name
        `,
        { from, to, locale: opts.locale },
    );

    const mapped: CategoriesReportRow[] = rows.map((row) => ({
        category_id: Number(row.category_id),
        name: (row.name as string) ?? "",
        items_sold: n(row.items_sold as number),
        net_sales: n(row.net_sales as number),
        products: n(row.products as number),
        orders: n(row.orders as number),
    }));

    sortRows(mapped, opts.orderBy, opts.orderDir);
    return paginate(mapped, opts.page, opts.limit);
}

export interface CouponsReportRow {
    coupon_id: number | null;
    code: string;
    orders: number;
    amount: number;
    created_at: string | null;
    expires_at: string | null;
    type: string | null;
}

export async function computeCouponsTable(
    from: Date,
    to: Date,
    opts: { orderBy: "orders" | "amount" | "code"; orderDir: "asc" | "desc"; page: number; limit: number },
): Promise<PaginatedRows<CouponsReportRow>> {
    const { rows } = await db.rawQuery<{ rows: Record<string, unknown>[] }>(
        `
        SELECT
            cl.code_snapshot AS code,
            MAX(cl.coupon_id) AS coupon_id,
            COUNT(DISTINCT cl.order_id) AS orders,
            COALESCE(SUM(cl.discount), 0) AS amount,
            MAX(c.created_at) AS created_at,
            MAX(c.expires_at) AS expires_at,
            MAX(c.discount_type) AS type
        FROM order_coupon_lines cl
        INNER JOIN orders o ON o.id = cl.order_id
        LEFT JOIN coupons c ON c.id = cl.coupon_id
        WHERE o.deleted_at IS NULL AND o.status IN ${COUNTED_SQL}
          AND o.created_at >= :from AND o.created_at <= :to
        GROUP BY cl.code_snapshot
        `,
        { from, to },
    );

    const mapped: CouponsReportRow[] = rows.map((row) => ({
        coupon_id: row.coupon_id === null ? null : Number(row.coupon_id),
        code: (row.code as string) ?? "",
        orders: n(row.orders as number),
        amount: n(row.amount as number),
        created_at: row.created_at ? toIso(row.created_at as string | Date) : null,
        expires_at: row.expires_at ? toIso(row.expires_at as string | Date) : null,
        type: (row.type as string | null) ?? null,
    }));

    sortRows(mapped, opts.orderBy === "code" ? "code" : opts.orderBy, opts.orderDir);
    return paginate(mapped, opts.page, opts.limit);
}

export interface TaxesReportRow {
    code: string;
    rate: number;
    orders: number;
    total_tax: number;
    order_tax: number;
    shipping_tax: number;
}

export async function computeTaxesTable(
    from: Date,
    to: Date,
    opts: { orderBy: "total_tax" | "orders" | "code"; orderDir: "asc" | "desc"; page: number; limit: number },
): Promise<PaginatedRows<TaxesReportRow>> {
    const { rows } = await db.rawQuery<{ rows: Record<string, unknown>[] }>(
        `
        SELECT
            tl.rate_code_snapshot AS code,
            MAX(tl.rate_percent_snapshot) AS rate,
            COUNT(DISTINCT tl.order_id) AS orders,
            COALESCE(SUM(tl.tax_total + tl.shipping_tax_total), 0) AS total_tax,
            COALESCE(SUM(tl.tax_total), 0) AS order_tax,
            COALESCE(SUM(tl.shipping_tax_total), 0) AS shipping_tax
        FROM order_tax_lines tl
        INNER JOIN orders o ON o.id = tl.order_id
        WHERE o.deleted_at IS NULL AND o.status IN ${COUNTED_SQL}
          AND o.created_at >= :from AND o.created_at <= :to
        GROUP BY tl.rate_code_snapshot
        `,
        { from, to },
    );

    const mapped: TaxesReportRow[] = rows.map((row) => ({
        code: (row.code as string) ?? "",
        rate: Number(row.rate ?? 0),
        orders: n(row.orders as number),
        total_tax: n(row.total_tax as number),
        order_tax: n(row.order_tax as number),
        shipping_tax: n(row.shipping_tax as number),
    }));

    sortRows(mapped, opts.orderBy === "code" ? "code" : opts.orderBy, opts.orderDir);
    return paginate(mapped, opts.page, opts.limit);
}

export interface TopCategoryRow {
    category_id: number;
    name: string;
    units: number;
    net_sales: number;
}

/** Top categories by units sold over a trailing window (Overview leaderboard sibling of top-products). */
export async function computeTopCategories(days: number, limit: number, locale: string): Promise<{ data: TopCategoryRow[]; range: { start_date: string; end_date: string; days: number } }> {
    const since = new Date(Date.now() - days * 86_400_000);
    const { rows } = await db.rawQuery<{ rows: Record<string, unknown>[] }>(
        `
        SELECT
            pc.id AS category_id,
            COALESCE(ct.name, '') AS name,
            COALESCE(SUM(li.quantity), 0) AS units,
            COALESCE(SUM(li.total), 0) AS net_sales
        FROM product_categories pc
        LEFT JOIN product_category_translations ct ON ct.category_id = pc.id AND ct.locale = :locale
        INNER JOIN product_category_links pcl ON pcl.category_id = pc.id
        INNER JOIN order_line_items li ON li.product_id = pcl.product_id
        INNER JOIN orders o ON o.id = li.order_id
        WHERE o.deleted_at IS NULL AND o.status IN ${COUNTED_SQL}
          AND o.created_at >= :since
        GROUP BY pc.id, ct.name
        ORDER BY units DESC, pc.id ASC
        LIMIT :limit
        `,
        { since, locale, limit },
    );

    return {
        data: rows.map((row) => ({
            category_id: Number(row.category_id),
            name: (row.name as string) ?? "",
            units: n(row.units as number),
            net_sales: n(row.net_sales as number),
        })),
        range: { start_date: since.toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), days },
    };
}

export type StockStatusFilter = "all" | "instock" | "outofstock" | "onbackorder" | "lowstock";

export interface StockReportRow {
    inventory_id: number;
    product_id: number;
    variation_id: number | null;
    name: string;
    sku: string | null;
    status: string;
    stock: number | null;
    manage_stock: boolean;
}

export interface StockReportCounts {
    total: number;
    instock: number;
    lowstock: number;
    outofstock: number;
    onbackorder: number;
}

/** SQL predicate for the stock status filter. `lowstock` is a derived pseudo-status, not a column value. */
function stockStatusPredicate(status: StockStatusFilter): string {
    if (status === "lowstock") {
        return "ii.manage_stock = true AND ii.low_stock_threshold IS NOT NULL AND ii.stock_quantity <= ii.low_stock_threshold AND ii.stock_status = 'instock'";
    }
    if (status === "all") return "TRUE";
    return `ii.stock_status = '${status}'`;
}

/**
 * Current stock snapshot — one row per inventory item (product or variation), joined to the product
 * for name/SKU. No date dimension: stock is a now-state, not a windowed aggregate. The list is a
 * report view, not a checkout stock check, so a short cache TTL is acceptable.
 */
export async function computeStockTable(opts: {
    status: StockStatusFilter;
    q?: string;
    orderBy: "stock" | "status" | "name";
    orderDir: "asc" | "desc";
    page: number;
    limit: number;
    locale: string;
}): Promise<PaginatedRows<StockReportRow>> {
    const predicate = stockStatusPredicate(opts.status);
    const { rows } = await db.rawQuery<{ rows: Record<string, unknown>[] }>(
        `
        SELECT
            ii.id AS inventory_id,
            ii.product_id,
            ii.variation_id,
            ii.stock_quantity AS stock,
            ii.manage_stock,
            ii.stock_status AS status,
            COALESCE(pt.name, '') AS name,
            COALESCE(v.sku, p.sku) AS sku
        FROM inventory_items ii
        INNER JOIN products p ON p.id = ii.product_id AND p.deleted_at IS NULL
        LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = :locale
        LEFT JOIN product_variations v ON v.id = ii.variation_id
        WHERE ${predicate}
          AND (:q::text IS NULL OR COALESCE(pt.name, '') ILIKE :qlike OR COALESCE(v.sku, p.sku) ILIKE :qlike)
        `,
        { locale: opts.locale, q: opts.q ?? null, qlike: opts.q ? `%${opts.q}%` : "%" },
    );

    const mapped: StockReportRow[] = rows.map((row) => ({
        inventory_id: Number(row.inventory_id),
        product_id: Number(row.product_id),
        variation_id: row.variation_id === null ? null : Number(row.variation_id),
        name: (row.name as string) ?? "",
        sku: (row.sku as string | null) ?? null,
        status: (row.status as string) ?? "instock",
        stock: (row.manage_stock as boolean) ? n(row.stock as number) : null,
        manage_stock: Boolean(row.manage_stock),
    }));

    sortRows(mapped, opts.orderBy === "status" ? "status" : opts.orderBy, opts.orderDir);
    return paginate(mapped, opts.page, opts.limit);
}

/** Footer counts for the stock report — total rows plus a breakdown by status (low stock derived). */
export async function computeStockCounts(): Promise<StockReportCounts> {
    const { rows } = await db.rawQuery<{ rows: Record<string, unknown>[] }>(
        `
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE ii.stock_status = 'instock') AS instock,
            COUNT(*) FILTER (WHERE ii.stock_status = 'outofstock') AS outofstock,
            COUNT(*) FILTER (WHERE ii.stock_status = 'onbackorder') AS onbackorder,
            COUNT(*) FILTER (WHERE ii.manage_stock = true AND ii.low_stock_threshold IS NOT NULL
                             AND ii.stock_quantity <= ii.low_stock_threshold AND ii.stock_status = 'instock') AS lowstock
        FROM inventory_items ii
        INNER JOIN products p ON p.id = ii.product_id AND p.deleted_at IS NULL
        `,
    );
    const row = rows[0] ?? {};
    return {
        total: n(row.total as number),
        instock: n(row.instock as number),
        lowstock: n(row.lowstock as number),
        outofstock: n(row.outofstock as number),
        onbackorder: n(row.onbackorder as number),
    };
}

/* ----------------------------- helpers ----------------------------- */

function toIso(value: string | Date): string {
    return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toIsoDate(value: string | Date): string {
    return toIso(value).slice(0, 10);
}

function sortRows<T>(rows: T[], key: string, dir: "asc" | "desc"): void {
    const factor = dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
        const av = (a as Record<string, unknown>)[key];
        const bv = (b as Record<string, unknown>)[key];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
        return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
    });
}
