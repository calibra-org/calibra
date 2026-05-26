import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import { ResourceNotFoundException } from "#exceptions/domain_exceptions";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { listCountiesForProvince, resolveCounty } from "#services/iran_county_resolver";
import { normalizeIranText } from "#services/iran_text_normalize";
import {
    adminRegionalProvinceCodeValidator,
    adminRegionalProvincesValidator,
    adminRegionalProvinceValidator,
} from "#validators/admin/insights_regional_validator";

const DEFAULT_TRAILING_DAYS = 30;
const DEFAULT_TOP_PRODUCTS = 5;
const MAX_TOP_PRODUCT_ROWS = 10;

interface ProvinceAggregateRow {
    region_id: string | number;
    code: string;
    fa_name: string | null;
    en_name: string | null;
    orders_count: string | number;
    revenue_minor: string | number | null;
}

interface CityAggregateRow {
    city_raw: string;
    orders_count: string | number;
    revenue_minor: string | number | null;
}

interface TopProductRow {
    product_id: string | number;
    name: string | null;
    sku: string | null;
    units: string | number;
    revenue_minor: string | number;
    image_url: string | null;
}

interface NormalizedRange {
    from: Date;
    to: Date;
}

/**
 * Admin → Regional insights. Two read endpoints power the dashboard's Iran map widget:
 *
 *   - `provinces`  — country-mode roll-up. Always returns 31 rows (one per ISO-3166-2:IR
 *                    province), even when a province had no orders in the window. This is
 *                    load-bearing for the heatmap's "zero" category — the client distinguishes
 *                    "no orders" (gray-100) from "few orders" (lightest palette stop).
 *   - `province`   — province-mode drill-down. Carries `top_products`, `cities`, and the
 *                    same totals scoped to the selected `IR-NN` province.
 *
 * Aggregation join is **`orders → order_addresses (kind='shipping') → regions`** so the map
 * reflects WHERE the order shipped, not where the customer happens to live now (an order is a
 * snapshot at purchase time). Status filter mirrors `reports_controller.topProducts` —
 * `('processing','completed')`.
 */
export default class AdminInsightsRegionalController {
    /** GET /api/v1/admin/insights/regional/provinces — country-wide aggregation. */
    async provinces(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminRegionalProvincesValidator);
        const locale = ctx.i18n.locale;
        const range = this.resolveRange(payload.from, payload.to);

        return cache.getOrSet({
            key: CacheKeys.admin.regionalProvinces(
                { from: range.from.toISOString(), to: range.to.toISOString(), metric: payload.metric ?? "orders" },
                locale,
            ),
            ttl: "2m",
            grace: "30s",
            tags: [CacheTags.regionalProvinces],
            factory: () => this.computeCountry(range, locale),
        });
    }

    /** GET /api/v1/admin/insights/regional/provinces/:code — per-province detail. */
    async province(ctx: HttpContext) {
        const params = await adminRegionalProvinceCodeValidator.validate(ctx.params);
        const payload = await ctx.request.validateUsing(adminRegionalProvinceValidator);
        const locale = ctx.i18n.locale;
        const range = this.resolveRange(payload.from, payload.to);
        const topProductsLimit = payload.top_products ?? DEFAULT_TOP_PRODUCTS;

        const province = await this.findProvinceOr404(params.code);

        return cache.getOrSet({
            key: CacheKeys.admin.regionalProvinceDetail(
                params.code,
                {
                    from: range.from.toISOString(),
                    to: range.to.toISOString(),
                    top_products: topProductsLimit,
                },
                locale,
            ),
            ttl: "2m",
            grace: "30s",
            tags: [CacheTags.regionalProvinces, CacheTags.regionalProvince(params.code)],
            factory: () => this.computeProvince(province, range, locale, topProductsLimit),
        });
    }

    /**
     * Resolve the active window. Both endpoints accept optional ISO `from` / `to` query params;
     * when either is missing the controller defaults to a trailing 30-day Gregorian window so
     * dashboards always have a sensible baseline.
     */
    private resolveRange(rawFrom: Date | undefined, rawTo: Date | undefined): NormalizedRange {
        const now = DateTime.utc();
        const to = rawTo ? DateTime.fromJSDate(rawTo).toUTC() : now;
        const from = rawFrom ? DateTime.fromJSDate(rawFrom).toUTC() : to.minus({ days: DEFAULT_TRAILING_DAYS });
        return { from: from.toJSDate(), to: to.toJSDate() };
    }

    private async findProvinceOr404(code: string): Promise<{ id: bigint | number; code: string }> {
        const { rows } = await db.rawQuery<{ rows: Array<{ id: string | number; code: string }> }>(
            `SELECT id, code FROM regions WHERE country_code = 'IR' AND parent_id IS NULL AND code = :code LIMIT 1`,
            { code },
        );
        const province = rows[0];
        if (!province) {
            throw new ResourceNotFoundException("region not found", { resource: "regions", code });
        }
        return { id: typeof province.id === "string" ? BigInt(province.id) : province.id, code: province.code };
    }

    private async computeCountry(range: NormalizedRange, locale: string) {
        const { rows } = await db.rawQuery<{ rows: ProvinceAggregateRow[] }>(
            `
            SELECT
                r.id AS region_id,
                r.code,
                t_fa.name AS fa_name,
                t_en.name AS en_name,
                COALESCE(SUM(CASE WHEN o.status IN ('processing','completed')
                                  AND o.created_at >= :from AND o.created_at < :to
                                  AND o.deleted_at IS NULL
                                  THEN 1 ELSE 0 END), 0)::bigint AS orders_count,
                COALESCE(SUM(CASE WHEN o.status IN ('processing','completed')
                                  AND o.created_at >= :from AND o.created_at < :to
                                  AND o.deleted_at IS NULL
                                  THEN o.grand_total ELSE 0 END), 0)::bigint AS revenue_minor
            FROM regions r
            LEFT JOIN region_translations t_fa ON t_fa.region_id = r.id AND t_fa.locale = 'fa'
            LEFT JOIN region_translations t_en ON t_en.region_id = r.id AND t_en.locale = 'en'
            LEFT JOIN order_addresses oa ON oa.region_id = r.id AND oa.kind = 'shipping'
            LEFT JOIN orders o ON o.id = oa.order_id
            WHERE r.country_code = 'IR' AND r.parent_id IS NULL
            GROUP BY r.id, r.code, t_fa.name, t_en.name
            ORDER BY r.code ASC
            `,
            { from: range.from, to: range.to },
        );

        let totalOrders = 0n;
        let totalRevenue = 0n;
        const data = rows.map((row) => {
            const orders = BigInt(row.orders_count);
            const revenue = BigInt(row.revenue_minor ?? 0);
            totalOrders += orders;
            totalRevenue += revenue;
            return {
                region_id: Number(row.region_id),
                code: row.code,
                name: { fa: row.fa_name ?? row.code, en: row.en_name ?? row.code },
                orders_count: Number(orders),
                revenue_minor: revenue.toString(),
            };
        });

        return {
            data,
            meta: {
                range: this.serializeRange(range),
                totals: {
                    orders_count: Number(totalOrders),
                    revenue_minor: totalRevenue.toString(),
                },
                locale,
            },
        };
    }

    private async computeProvince(
        province: { id: bigint | number; code: string },
        range: NormalizedRange,
        locale: string,
        topProductsLimit: number,
    ) {
        const provinceRow = await this.fetchProvinceRow(province, range);
        const topProducts = await this.fetchTopProductsForProvince(province, range, locale, topProductsLimit);
        const counties = await this.fetchCountiesForProvince(province, range);

        return {
            data: {
                region_id: Number(provinceRow.region_id),
                code: provinceRow.code,
                name: { fa: provinceRow.fa_name ?? provinceRow.code, en: provinceRow.en_name ?? provinceRow.code },
                orders_count: Number(BigInt(provinceRow.orders_count)),
                revenue_minor: BigInt(provinceRow.revenue_minor ?? 0).toString(),
                top_products: topProducts,
                counties,
            },
            meta: {
                range: this.serializeRange(range),
                locale,
            },
        };
    }

    private async fetchProvinceRow(
        province: { id: bigint | number; code: string },
        range: NormalizedRange,
    ): Promise<ProvinceAggregateRow> {
        const { rows } = await db.rawQuery<{ rows: ProvinceAggregateRow[] }>(
            `
            SELECT
                r.id AS region_id,
                r.code,
                t_fa.name AS fa_name,
                t_en.name AS en_name,
                COALESCE(SUM(CASE WHEN o.status IN ('processing','completed')
                                  AND o.created_at >= :from AND o.created_at < :to
                                  AND o.deleted_at IS NULL
                                  THEN 1 ELSE 0 END), 0)::bigint AS orders_count,
                COALESCE(SUM(CASE WHEN o.status IN ('processing','completed')
                                  AND o.created_at >= :from AND o.created_at < :to
                                  AND o.deleted_at IS NULL
                                  THEN o.grand_total ELSE 0 END), 0)::bigint AS revenue_minor
            FROM regions r
            LEFT JOIN region_translations t_fa ON t_fa.region_id = r.id AND t_fa.locale = 'fa'
            LEFT JOIN region_translations t_en ON t_en.region_id = r.id AND t_en.locale = 'en'
            LEFT JOIN order_addresses oa ON oa.region_id = r.id AND oa.kind = 'shipping'
            LEFT JOIN orders o ON o.id = oa.order_id
            WHERE r.id = :provinceId
            GROUP BY r.id, r.code, t_fa.name, t_en.name
            `,
            { from: range.from, to: range.to, provinceId: province.id.toString() },
        );

        const row = rows[0];
        if (!row) {
            throw new ResourceNotFoundException("region not found", { resource: "regions", code: province.code });
        }
        return row;
    }

    private async fetchTopProductsForProvince(
        province: { id: bigint | number; code: string },
        range: NormalizedRange,
        locale: string,
        limit: number,
    ): Promise<
        Array<{
            product_id: number;
            name: string;
            sku: string | null;
            units: number;
            revenue_minor: string;
            image_url: string | null;
        }>
    > {
        const { rows } = await db.rawQuery<{ rows: TopProductRow[] }>(
            `
            WITH agg AS (
                SELECT
                    li.product_id,
                    SUM(li.quantity)::int AS units,
                    SUM(li.total)::bigint AS revenue_minor,
                    MAX(li.name_snapshot) AS snapshot_name,
                    MAX(li.sku_snapshot) AS sku
                FROM order_line_items li
                INNER JOIN orders o ON o.id = li.order_id
                INNER JOIN order_addresses oa ON oa.order_id = o.id AND oa.kind = 'shipping'
                WHERE o.deleted_at IS NULL
                    AND o.status IN ('processing','completed')
                    AND o.created_at >= :from AND o.created_at < :to
                    AND oa.region_id = :provinceId
                    AND li.product_id IS NOT NULL
                GROUP BY li.product_id
            ),
            primary_image AS (
                SELECT DISTINCT ON (pi.product_id)
                    pi.product_id,
                    m.url AS image_url
                FROM product_images pi
                INNER JOIN media m ON m.id = pi.media_id
                ORDER BY pi.product_id, pi.position ASC, pi.id ASC
            )
            SELECT
                agg.product_id,
                COALESCE(pt.name, agg.snapshot_name) AS name,
                agg.sku,
                agg.units,
                agg.revenue_minor,
                pi.image_url
            FROM agg
            LEFT JOIN product_translations pt
                ON pt.product_id = agg.product_id AND pt.locale = :locale
            LEFT JOIN primary_image pi
                ON pi.product_id = agg.product_id
            ORDER BY agg.revenue_minor DESC, agg.product_id ASC
            LIMIT :limit
            `,
            {
                from: range.from,
                to: range.to,
                provinceId: province.id.toString(),
                locale,
                limit: Math.min(limit, MAX_TOP_PRODUCT_ROWS),
            },
        );

        return rows.map((row) => ({
            product_id: Number(row.product_id),
            name: row.name ?? "",
            sku: row.sku,
            units: Number(row.units),
            revenue_minor: BigInt(row.revenue_minor).toString(),
            image_url: row.image_url,
        }));
    }

    /**
     * Emits one row per sajaddp county in the province plus any unrecognised snapshot rows.
     * Each known county gets its order/revenue totals (zero when no orders fell into it) so
     * the sidebar can render the full scrollable list — same shape as the country view's
     * "always 31 rows" guarantee. Unknown snapshot text appended at the end as
     * `matched: false` for data-hygiene visibility.
     *
     * `MAX_COUNTY_ROWS` is intentionally NOT applied — the operator scrolls the whole list.
     */
    private async fetchCountiesForProvince(
        province: { id: bigint | number; code: string },
        range: NormalizedRange,
    ): Promise<
        Array<{
            name: { fa: string; en: string | null };
            orders_count: number;
            revenue_minor: string;
            matched: boolean;
        }>
    > {
        const rawCities = await this.fetchRawCityAggregates(province, range);

        type MergedCounty = {
            name: { fa: string; en: string | null };
            orders_count: number;
            revenue_minor: bigint;
            matched: boolean;
        };
        /** Pre-seed every county with zeroed totals so the response always lists every county. */
        const merged = new Map<string, MergedCounty>();
        for (const county of listCountiesForProvince(province.code)) {
            merged.set(`county:${county.fa}`, {
                name: { fa: county.fa, en: null },
                orders_count: 0,
                revenue_minor: 0n,
                matched: true,
            });
        }

        for (const row of rawCities) {
            const orders = Number(row.orders_count);
            const revenue = BigInt(row.revenue_minor ?? 0);
            const resolved = resolveCounty(row.city_raw);
            const slot = resolved ? `county:${resolved.countyFa}` : `raw:${normalizeIranText(row.city_raw) || row.city_raw}`;
            const existing = merged.get(slot);
            if (existing) {
                existing.orders_count += orders;
                existing.revenue_minor += revenue;
                continue;
            }
            if (resolved) {
                merged.set(slot, {
                    name: { fa: resolved.countyFa, en: null },
                    orders_count: orders,
                    revenue_minor: revenue,
                    matched: true,
                });
            } else {
                merged.set(slot, {
                    name: { fa: row.city_raw, en: null },
                    orders_count: orders,
                    revenue_minor: revenue,
                    matched: false,
                });
            }
        }

        return [...merged.values()]
            .sort((a, b) => {
                /** Non-zero rows first, then matched zeros, then unmatched fallbacks. */
                const aValue = a.orders_count;
                const bValue = b.orders_count;
                if (aValue !== bValue) return bValue - aValue;
                if (a.matched !== b.matched) return a.matched ? -1 : 1;
                return a.name.fa.localeCompare(b.name.fa, "fa");
            })
            .map((row) => ({
                name: row.name,
                orders_count: row.orders_count,
                revenue_minor: row.revenue_minor.toString(),
                matched: row.matched,
            }));
    }

    private async fetchRawCityAggregates(
        province: { id: bigint | number; code: string },
        range: NormalizedRange,
    ): Promise<CityAggregateRow[]> {
        const { rows } = await db.rawQuery<{ rows: CityAggregateRow[] }>(
            `
            SELECT
                MIN(oa.city) AS city_raw,
                COUNT(o.id)::bigint AS orders_count,
                COALESCE(SUM(o.grand_total), 0)::bigint AS revenue_minor
            FROM order_addresses oa
            INNER JOIN orders o ON o.id = oa.order_id
            WHERE oa.kind = 'shipping'
                AND oa.region_id = :provinceId
                AND o.status IN ('processing','completed')
                AND o.created_at >= :from AND o.created_at < :to
                AND o.deleted_at IS NULL
                AND length(trim(coalesce(oa.city, ''))) > 0
            GROUP BY lower(trim(oa.city))
            ORDER BY orders_count DESC
            LIMIT 50
            `,
            { from: range.from, to: range.to, provinceId: province.id.toString() },
        );

        return rows;
    }

    private serializeRange(range: NormalizedRange): { from: string; to: string } {
        return { from: range.from.toISOString(), to: range.to.toISOString() };
    }
}
