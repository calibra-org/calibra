import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import Coupon from "#models/coupon";

export interface CouponExportFilters {
    tab?: string;
    status?: string;
    search?: string;
    discountTypes?: string[];
    brandIds?: number[];
}

const CSV_HEADERS = [
    "id",
    "code",
    "status",
    "discount_type",
    "amount_percent",
    "amount_minor",
    "starts_at",
    "expires_at",
    "minimum_amount",
    "maximum_amount",
    "usage_limit_global",
    "usage_limit_per_user",
    "free_shipping",
    "individual_use",
    "exclude_sale_items",
    "redemptions_count",
    "products_count",
    "categories_count",
    "brands_count",
    "emails_count",
    "description_fa",
    "description_en",
];

/**
 * Sync CSV export — streams every matching coupon as a single CSV body. Suitable for the
 * coupon-count cardinality we expect (low thousands at most); a job/SSE pipeline like the
 * products exporter is unnecessary at this scale. Filters mirror the list endpoint so an
 * operator can "Export current view" without re-encoding the filter set.
 */
export async function exportCouponsToCsv(filters: CouponExportFilters): Promise<{ csv: string; count: number }> {
    const query = Coupon.query();
    if (filters.tab === "trashed") {
        query.whereNotNull("deleted_at");
    } else if (filters.tab !== "any") {
        query.whereNull("deleted_at");
    }
    if (filters.status) query.where("status", filters.status);
    if (filters.search) query.whereILike("code", `%${filters.search}%`);
    if (filters.discountTypes && filters.discountTypes.length > 0) {
        query.whereIn("discount_type", filters.discountTypes);
    }
    query.orderBy("created_at", "desc");
    const coupons = await query.exec();
    if (coupons.length === 0) {
        return { csv: `${CSV_HEADERS.join(",")}\n`, count: 0 };
    }

    const ids = coupons.map((c) => Number(c.id));
    const stats = await fetchExportStats(ids);

    const lines: string[] = [CSV_HEADERS.join(",")];
    for (const coupon of coupons) {
        const sidecar = stats.get(Number(coupon.id));
        lines.push(
            [
                coupon.id,
                csvCell(coupon.code),
                coupon.status,
                coupon.discountType,
                coupon.amountPercent === null ? "" : String(coupon.amountPercent),
                coupon.amountMinor === null ? "" : String(coupon.amountMinor),
                isoCell(coupon.startsAt),
                isoCell(coupon.expiresAt),
                coupon.minimumAmount === null ? "" : String(coupon.minimumAmount),
                coupon.maximumAmount === null ? "" : String(coupon.maximumAmount),
                coupon.usageLimitGlobal === null ? "" : String(coupon.usageLimitGlobal),
                coupon.usageLimitPerUser === null ? "" : String(coupon.usageLimitPerUser),
                coupon.freeShipping ? "true" : "false",
                coupon.individualUse ? "true" : "false",
                coupon.excludeSaleItems ? "true" : "false",
                sidecar?.redemptionsCount ?? 0,
                sidecar?.productsCount ?? 0,
                sidecar?.categoriesCount ?? 0,
                sidecar?.brandsCount ?? 0,
                sidecar?.emailsCount ?? 0,
                csvCell(sidecar?.descriptionFa ?? ""),
                csvCell(sidecar?.descriptionEn ?? ""),
            ].join(","),
        );
    }

    return { csv: `${lines.join("\n")}\n`, count: coupons.length };
}

interface ExportStats {
    redemptionsCount: number;
    productsCount: number;
    categoriesCount: number;
    brandsCount: number;
    emailsCount: number;
    descriptionFa: string | null;
    descriptionEn: string | null;
}

async function fetchExportStats(ids: number[]): Promise<Map<number, ExportStats>> {
    const out = new Map<number, ExportStats>();
    const result = await db.rawQuery<{
        rows: {
            coupon_id: string | number;
            redemptions_count: string | number;
            products_count: string | number;
            categories_count: string | number;
            brands_count: string | number;
            emails_count: string | number;
            description_fa: string | null;
            description_en: string | null;
        }[];
    }>(
        `SELECT
            c.id AS coupon_id,
            (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = c.id) AS redemptions_count,
            (SELECT COUNT(*) FROM coupon_product_constraints WHERE coupon_id = c.id) AS products_count,
            (SELECT COUNT(*) FROM coupon_category_constraints WHERE coupon_id = c.id) AS categories_count,
            (SELECT COUNT(*) FROM coupon_brand_constraints WHERE coupon_id = c.id) AS brands_count,
            (SELECT COUNT(*) FROM coupon_email_restrictions WHERE coupon_id = c.id) AS emails_count,
            (SELECT description FROM coupon_translations WHERE coupon_id = c.id AND locale = 'fa' LIMIT 1) AS description_fa,
            (SELECT description FROM coupon_translations WHERE coupon_id = c.id AND locale = 'en' LIMIT 1) AS description_en
         FROM coupons c
         WHERE c.id = ANY (?::bigint[])`,
        [ids],
    );
    for (const row of result.rows) {
        out.set(Number(row.coupon_id), {
            redemptionsCount: Number(row.redemptions_count ?? 0),
            productsCount: Number(row.products_count ?? 0),
            categoriesCount: Number(row.categories_count ?? 0),
            brandsCount: Number(row.brands_count ?? 0),
            emailsCount: Number(row.emails_count ?? 0),
            descriptionFa: row.description_fa,
            descriptionEn: row.description_en,
        });
    }
    return out;
}

/** RFC 4180 cell quoting — only when the value contains a separator, quote, or newline. */
function csvCell(value: string): string {
    if (value === null || value === undefined) return "";
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function isoCell(value: DateTime | null): string {
    if (value === null) return "";
    return value.toISO() ?? "";
}
