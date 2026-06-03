import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import vine from "@vinejs/vine";
import { DateTime } from "luxon";

import Coupon from "#models/coupon";
import CouponBrandConstraint from "#models/coupon_brand_constraint";
import CouponCategoryConstraint from "#models/coupon_category_constraint";
import CouponEmailRestriction from "#models/coupon_email_restriction";
import CouponProductConstraint from "#models/coupon_product_constraint";
import CouponRedemption from "#models/coupon_redemption";
import CouponTranslation from "#models/coupon_translation";
import { exportCouponsToCsv } from "#services/coupon_csv_exporter";
import { runCouponTest } from "#services/coupon_test_runner";
import { currentTrx, withTenantTransaction } from "#services/tenant_context";
import { adminCouponsView } from "#table_views/admin/coupons";
import { collection, paginated, resource } from "#transformers/api_envelope";
import CouponRedemptionTransformer from "#transformers/coupon_redemption_transformer";
import CouponTransformer, { type CouponListStats } from "#transformers/coupon_transformer";
import { adminCouponTestValidator } from "#validators/coupons/coupon_test_validator";
import { batchCouponValidator, createCouponValidator, updateCouponValidator } from "#validators/coupons/coupon_validator";

type CreatePayload = Awaited<ReturnType<typeof createCouponValidator.validate>>;
type UpdatePayload = Awaited<ReturnType<typeof updateCouponValidator.validate>>;

/** Defaults retained for the redemptions sub-endpoint (the main list now flows via TableView). */
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

/**
 * Coupons list query — TableView grammar plus the endpoint's bespoke extras. The `q` free-text
 * search spans the coupon code + translated description. `tab` is the tab-strip scope
 * (any/active/disabled/expired/scheduled/used/trashed). `expiring_soon` / `has_*_constraints` /
 * `brand` are existence-check predicates the runtime can't model on its own. Strict mode: any
 * other top-level query key returns 422.
 */
const adminCouponsListTableViewValidator = adminCouponsView.compileStrict({
    extras: {
        q: vine.string().trim().maxLength(120).optional(),
        tab: vine.enum(["any", "active", "disabled", "expired", "scheduled", "used", "trashed"] as const).optional(),
        expiring_soon: vine.boolean().optional(),
        has_product_constraints: vine.boolean().optional(),
        has_category_constraints: vine.boolean().optional(),
        has_email_restrictions: vine.boolean().optional(),
        brand: vine.string().trim().maxLength(255).optional(),
    },
});

/**
 * Admin CRUD over `coupons`. Soft-delete blocks future redemptions but preserves history (the
 * coupon stays joinable from `coupon_redemptions` for reporting). Updates are non-retroactive —
 * existing redemptions keep the discount they were created with, and only future cart applies see
 * the new amount/percent.
 */
export default class AdminCouponsController {
    async index(ctx: HttpContext) {
        /** Parse the TableView portion (filter[] / filterOr[] / sort[] / page / limit). All
         * bespoke filters below stay as ctx.request.input reads — same pattern as products. */
        const qs = ctx.request.qs();
        const parsed = await adminCouponsListTableViewValidator.validate(qs);

        const q = String(ctx.request.input("q", "")).trim();
        /** Tab keyword → the predicate the spec describes. Soft-deleted rows are normally excluded;
         * `trashed` opts back into them, `any` shows everything. */
        const tab = String(ctx.request.input("tab", "")).trim();

        const query = Coupon.query();

        if (tab === "trashed") {
            query.whereNotNull("deleted_at");
        } else if (tab === "any") {
            // both
        } else {
            query.whereNull("deleted_at");
        }

        const nowIso = DateTime.utc().toISO() ?? new Date().toISOString();
        if (tab === "active") {
            query
                .where("status", "active")
                .where((q) => q.whereNull("starts_at").orWhere("starts_at", "<=", nowIso))
                .where((q) => q.whereNull("expires_at").orWhere("expires_at", ">=", nowIso));
        } else if (tab === "disabled") {
            query.where("status", "disabled");
        } else if (tab === "expired") {
            query.whereNotNull("expires_at").where("expires_at", "<", nowIso);
        } else if (tab === "scheduled") {
            query.whereNotNull("starts_at").where("starts_at", ">", nowIso);
        }

        if (q) {
            const needle = `%${q}%`;
            query.where((sub) => {
                sub.whereILike("code", needle).orWhereExists((nested) => {
                    nested
                        .from("coupon_translations")
                        .whereColumn("coupon_translations.coupon_id", "coupons.id")
                        .whereILike("coupon_translations.description", needle);
                });
            });
        }

        /* Per-column filters that used to live here (discount_type, free_shipping,
         * individual_use, exclude_sale_items, min_amount_*, max_amount_*, starts_*, expires_*)
         * now flow through the TableView grammar via view.run() below. */

        if (truthy(ctx.request.input("expiring_soon"))) {
            const horizon = DateTime.utc().plus({ days: 7 }).toISO() ?? new Date().toISOString();
            query.whereNotNull("expires_at").where("expires_at", "<=", horizon).where("expires_at", ">=", nowIso);
        }

        if (truthy(ctx.request.input("has_product_constraints"))) {
            query.whereExists((sub) =>
                sub.from("coupon_product_constraints").whereColumn("coupon_product_constraints.coupon_id", "coupons.id"),
            );
        }
        if (truthy(ctx.request.input("has_category_constraints"))) {
            query.whereExists((sub) =>
                sub.from("coupon_category_constraints").whereColumn("coupon_category_constraints.coupon_id", "coupons.id"),
            );
        }
        if (truthy(ctx.request.input("has_email_restrictions"))) {
            query.whereExists((sub) =>
                sub.from("coupon_email_restrictions").whereColumn("coupon_email_restrictions.coupon_id", "coupons.id"),
            );
        }
        const brandIds = parseList(ctx.request.input("brand"))
            .map((s) => Number(s))
            .filter(Number.isFinite);
        if (brandIds.length > 0) {
            query.whereExists((sub) =>
                sub
                    .from("coupon_brand_constraints")
                    .whereColumn("coupon_brand_constraints.coupon_id", "coupons.id")
                    .whereIn("coupon_brand_constraints.brand_id", brandIds),
            );
        }

        const redemptionsMin = numeric(ctx.request.input("redemptions_min"));
        const redemptionsMax = numeric(ctx.request.input("redemptions_max"));
        if (redemptionsMin !== null || redemptionsMax !== null) {
            query.whereIn("coupons.id", (sub) => {
                sub.from("coupon_redemptions")
                    .select("coupon_id")
                    .groupBy("coupon_id")
                    .havingRaw(
                        `count(*) ${redemptionsMin !== null && redemptionsMax !== null ? "BETWEEN ? AND ?" : redemptionsMin !== null ? ">= ?" : "<= ?"}`,
                        redemptionsMin !== null && redemptionsMax !== null
                            ? [redemptionsMin, redemptionsMax]
                            : [redemptionsMin ?? redemptionsMax!],
                    );
            });
        }

        const { data: rows, meta } = await adminCouponsView.run<Coupon>(query, parsed);
        const stats = await fetchCouponListStats(rows.map((c) => Number(c.id)));
        CouponTransformer.setStats(stats);
        try {
            const { data } = await collection<unknown>(CouponTransformer.transform(rows).useVariant("forList"));
            return { data, meta };
        } finally {
            CouponTransformer.setStats(new Map());
        }
    }

    /** GET /api/v1/admin/coupons/counts — status tab buckets driven by the spec's predicate set. */
    async counts(_ctx: HttpContext) {
        const nowIso = DateTime.utc().toISO() ?? new Date().toISOString();
        const horizonIso = DateTime.utc().plus({ days: 7 }).toISO() ?? nowIso;

        const result = await currentTrx().rawQuery<{
            rows: {
                all: string;
                active: string;
                disabled: string;
                expired: string;
                scheduled: string;
                used: string;
                trashed: string;
                expiring_soon: string;
            }[];
        }>(
            `SELECT
                COUNT(*) FILTER (WHERE deleted_at IS NULL) AS all,
                COUNT(*) FILTER (WHERE deleted_at IS NULL
                                   AND status = 'active'
                                   AND (starts_at IS NULL OR starts_at <= ?)
                                   AND (expires_at IS NULL OR expires_at >= ?)) AS active,
                COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'disabled') AS disabled,
                COUNT(*) FILTER (WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at < ?) AS expired,
                COUNT(*) FILTER (WHERE deleted_at IS NULL AND starts_at IS NOT NULL AND starts_at > ?) AS scheduled,
                COUNT(*) FILTER (WHERE deleted_at IS NULL
                                   AND EXISTS (
                                       SELECT 1 FROM coupon_redemptions cr WHERE cr.coupon_id = coupons.id
                                   )) AS used,
                COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS trashed,
                COUNT(*) FILTER (WHERE deleted_at IS NULL
                                   AND expires_at IS NOT NULL
                                   AND expires_at BETWEEN ? AND ?) AS expiring_soon
             FROM coupons`,
            [nowIso, nowIso, nowIso, nowIso, nowIso, horizonIso],
        );

        const row = result.rows[0];
        return {
            data: {
                all: Number(row?.all ?? 0),
                active: Number(row?.active ?? 0),
                disabled: Number(row?.disabled ?? 0),
                expired: Number(row?.expired ?? 0),
                scheduled: Number(row?.scheduled ?? 0),
                used: Number(row?.used ?? 0),
                trashed: Number(row?.trashed ?? 0),
                expiring_soon: Number(row?.expiring_soon ?? 0),
            },
        };
    }

    /**
     * GET /api/v1/admin/coupons/code-check?code= — uniqueness probe for the editor. Returns
     * `available: true` when no other coupon (live or trashed) uses the code, and a suggested
     * alternative when it's taken (`<code>-2`, `<code>-3`, …).
     */
    async codeCheck(ctx: HttpContext) {
        const code = String(ctx.request.input("code", "")).trim().toUpperCase();
        if (code.length < 2 || code.length > 64) {
            return { data: { available: false, suggestion: null, reason: "invalid_length" } };
        }
        const existing = await Coupon.query().where("code", code).first();
        if (!existing) return { data: { available: true, suggestion: null } };

        let suggestion = "";
        for (let n = 2; n < 50; n += 1) {
            const candidate = `${code}-${n}`;
            const taken = await Coupon.query().where("code", candidate).first();
            if (!taken) {
                suggestion = candidate;
                break;
            }
        }
        return { data: { available: false, suggestion: suggestion || null } };
    }

    /**
     * POST /api/v1/admin/coupons/:id/test — runs the cart-side eligibility logic against a
     * synthetic cart without writing to the database. Useful from the editor's "Quick test" panel
     * before flipping a coupon live. The reason / calculation shape mirrors what the storefront
     * cart-apply endpoint would return.
     */
    async test(ctx: HttpContext) {
        const couponId = Number(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminCouponTestValidator);
        const coupon = await this.loadWithRelations(couponId);
        if (!coupon) throw notFound();
        const result = await runCouponTest(coupon, payload, ctx.i18n);
        return { data: result };
    }

    /**
     * GET /api/v1/admin/coupons/export — sync CSV download. Honors the same tab + status +
     * search + discount_type filters as the list endpoint so an operator can "export current
     * view." Streams as `text/csv` with a filename hint; clients are expected to redirect to
     * this URL (e.g. via window.location.href).
     */
    async exportCsv(ctx: HttpContext) {
        const filters = {
            tab: ctx.request.input("tab"),
            status: ctx.request.input("status"),
            search: String(ctx.request.input("q", "")).trim() || undefined,
            discountTypes: parseList(ctx.request.input("discount_type")),
            brandIds: parseList(ctx.request.input("brand"))
                .map((s) => Number(s))
                .filter(Number.isFinite),
        };
        const { csv, count } = await exportCouponsToCsv(filters);
        const filename = `coupons-${DateTime.utc().toFormat("yyyyLLdd-HHmm")}.csv`;
        ctx.response.header("content-type", "text/csv; charset=utf-8");
        ctx.response.header("content-disposition", `attachment; filename="${filename}"`);
        ctx.response.header("x-coupon-export-count", String(count));
        return csv;
    }

    async show(ctx: HttpContext) {
        const coupon = await this.loadWithRelations(Number(ctx.params.id));
        if (!coupon) throw notFound();
        return resource(CouponTransformer.transform(coupon).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createCouponValidator);
        const coupon = await withTenantTransaction(async (trx) => {
            const created = await Coupon.create(this.buildAttributes(payload, "create"), { client: trx });
            await this.writeRelations(trx, created.id, payload);
            return created;
        });
        const fresh = await this.loadWithRelations(Number(coupon.id));
        ctx.response.status(201);
        return resource(CouponTransformer.transform(fresh!).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const coupon = await Coupon.query().where("id", Number(ctx.params.id)).whereNull("deleted_at").first();
        if (!coupon) throw notFound();
        const payload = await ctx.request.validateUsing(updateCouponValidator);

        await withTenantTransaction(async (trx) => {
            coupon.useTransaction(trx);
            coupon.merge(this.buildAttributes(payload, "update"));
            await coupon.save();
            await this.writeRelations(trx, coupon.id, payload);
        });

        const fresh = await this.loadWithRelations(Number(coupon.id));
        return resource(CouponTransformer.transform(fresh!).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const coupon = await Coupon.query().where("id", Number(ctx.params.id)).whereNull("deleted_at").first();
        if (!coupon) throw notFound();
        /**
         * Soft-delete: keeps `coupon_redemptions` joinable for reporting. The discounter excludes
         * soft-deleted coupons from cart-apply lookups.
         */
        coupon.deletedAt = DateTime.utc();
        await coupon.save();
        return ctx.response.status(204);
    }

    async batch(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(batchCouponValidator);
        const result: { created: number[]; updated: number[]; deleted: number[] } = {
            created: [],
            updated: [],
            deleted: [],
        };

        await withTenantTransaction(async (trx) => {
            for (const row of payload.create ?? []) {
                const created = await Coupon.create(this.buildAttributes(row as CreatePayload, "create"), { client: trx });
                await this.writeRelations(trx, created.id, row as CreatePayload);
                result.created.push(Number(created.id));
            }
            for (const row of payload.update ?? []) {
                const coupon = await Coupon.query({ client: trx }).where("id", row.id).whereNull("deleted_at").first();
                if (!coupon) continue;
                coupon.merge(this.buildAttributes(row as UpdatePayload, "update"));
                await coupon.save();
                await this.writeRelations(trx, coupon.id, row as UpdatePayload);
                result.updated.push(Number(coupon.id));
            }
            for (const id of payload.delete ?? []) {
                const coupon = await Coupon.query({ client: trx }).where("id", id).whereNull("deleted_at").first();
                if (!coupon) continue;
                coupon.deletedAt = DateTime.utc();
                await coupon.save();
                result.deleted.push(Number(coupon.id));
            }
        });

        return result;
    }

    async redemptions(ctx: HttpContext) {
        const page = Math.max(1, Number(ctx.request.input("page", 1)) || 1);
        const perPage = Math.min(
            PAGE_SIZE_MAX,
            Math.max(1, Number(ctx.request.input("perPage", PAGE_SIZE_DEFAULT)) || PAGE_SIZE_DEFAULT),
        );
        const couponId = Number(ctx.params.id);
        const coupon = await Coupon.query().where("id", couponId).first();
        if (!coupon) throw notFound();
        const paginator = await CouponRedemption.query()
            .where("coupon_id", couponId)
            .orderBy("redeemed_at", "desc")
            .paginate(page, perPage);
        return paginated(CouponRedemptionTransformer.transform(paginator.all()), paginator);
    }

    /**
     * Translate the validated payload into the Lucid merge keys. Discriminated by mode so the
     * defaults applied on create don't clobber existing values on update — e.g. an update that
     * doesn't touch `individual_use` keeps the current value rather than reverting to false.
     */
    private buildAttributes(
        payload: CreatePayload | UpdatePayload,
        mode: "create" | "update",
    ): Partial<{
        code: string;
        discountType: string;
        amountMinor: number | null;
        amountPercent: string | null;
        startsAt: DateTime | null;
        expiresAt: DateTime | null;
        individualUse: boolean;
        excludeSaleItems: boolean;
        minimumAmount: number | null;
        maximumAmount: number | null;
        usageLimitGlobal: number | null;
        usageLimitPerUser: number | null;
        limitUsageToXItems: number | null;
        freeShipping: boolean;
        status: string;
    }> {
        const out: Record<string, unknown> = {};
        if (payload.code !== undefined) out.code = payload.code;
        if (payload.discount_type !== undefined) out.discountType = payload.discount_type;
        if (payload.amount_minor !== undefined) out.amountMinor = payload.amount_minor;
        if (payload.amount_percent !== undefined) {
            out.amountPercent = payload.amount_percent === null ? null : String(payload.amount_percent);
        }
        if (payload.starts_at !== undefined) {
            out.startsAt = payload.starts_at === null ? null : DateTime.fromJSDate(payload.starts_at as Date);
        }
        if (payload.expires_at !== undefined) {
            out.expiresAt = payload.expires_at === null ? null : DateTime.fromJSDate(payload.expires_at as Date);
        }
        if (payload.individual_use !== undefined) out.individualUse = payload.individual_use;
        if (payload.exclude_sale_items !== undefined) out.excludeSaleItems = payload.exclude_sale_items;
        if (payload.minimum_amount !== undefined) out.minimumAmount = payload.minimum_amount;
        if (payload.maximum_amount !== undefined) out.maximumAmount = payload.maximum_amount;
        if (payload.usage_limit_global !== undefined) out.usageLimitGlobal = payload.usage_limit_global;
        if (payload.usage_limit_per_user !== undefined) out.usageLimitPerUser = payload.usage_limit_per_user;
        if (payload.limit_usage_to_x_items !== undefined) out.limitUsageToXItems = payload.limit_usage_to_x_items;
        if (payload.free_shipping !== undefined) out.freeShipping = payload.free_shipping;
        if (payload.status !== undefined) out.status = payload.status;

        if (mode === "create") {
            if (out.status === undefined) out.status = "active";
            if (out.individualUse === undefined) out.individualUse = false;
            if (out.excludeSaleItems === undefined) out.excludeSaleItems = false;
            if (out.freeShipping === undefined) out.freeShipping = false;
        }
        return out as never;
    }

    /**
     * Rewrite the three relation sets (translations, product/category constraints, email
     * restrictions) when present on the payload. Each set is full-replace semantics — the admin
     * UI sends the desired final state, not a delta, which matches every other taxonomy admin
     * endpoint in the API.
     */
    private async writeRelations(
        trx: TransactionClientContract,
        couponId: bigint | number,
        payload: CreatePayload | UpdatePayload,
    ) {
        if (payload.translations !== undefined) {
            await CouponTranslation.query({ client: trx }).where("coupon_id", Number(couponId)).delete();
            for (const t of payload.translations ?? []) {
                await CouponTranslation.create(
                    {
                        couponId,
                        locale: t.locale,
                        description: t.description ?? null,
                    },
                    { client: trx },
                );
            }
        }
        if (payload.product_constraints !== undefined) {
            await CouponProductConstraint.query({ client: trx }).where("coupon_id", Number(couponId)).delete();
            for (const c of payload.product_constraints ?? []) {
                await CouponProductConstraint.create(
                    {
                        couponId,
                        productId: c.product_id,
                        mode: c.mode,
                    },
                    { client: trx },
                );
            }
        }
        if (payload.category_constraints !== undefined) {
            await CouponCategoryConstraint.query({ client: trx }).where("coupon_id", Number(couponId)).delete();
            for (const c of payload.category_constraints ?? []) {
                await CouponCategoryConstraint.create(
                    {
                        couponId,
                        categoryId: c.category_id,
                        mode: c.mode,
                    },
                    { client: trx },
                );
            }
        }
        if (payload.brand_constraints !== undefined) {
            await CouponBrandConstraint.query({ client: trx }).where("coupon_id", Number(couponId)).delete();
            for (const c of payload.brand_constraints ?? []) {
                await CouponBrandConstraint.create(
                    {
                        couponId,
                        brandId: c.brand_id,
                        mode: c.mode,
                    },
                    { client: trx },
                );
            }
        }
        if (payload.email_restrictions !== undefined) {
            await CouponEmailRestriction.query({ client: trx }).where("coupon_id", Number(couponId)).delete();
            for (const pattern of payload.email_restrictions ?? []) {
                await CouponEmailRestriction.create({ couponId, emailPattern: pattern }, { client: trx });
            }
        }
    }

    private async loadWithRelations(id: number): Promise<Coupon | null> {
        return Coupon.query()
            .where("id", id)
            .preload("translations")
            .preload("productConstraints")
            .preload("categoryConstraints")
            .preload("brandConstraints")
            .preload("emailRestrictions")
            .first();
    }
}

function parseList(input: unknown): string[] {
    if (Array.isArray(input)) return input.map(String).filter((s) => s.length > 0);
    if (typeof input === "string" && input.length > 0) {
        return input
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }
    return [];
}

function truthy(input: unknown): boolean {
    return input === true || input === "true" || input === "1" || input === 1;
}

function numeric(input: unknown): number | null {
    if (input === null || input === undefined || input === "") return null;
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
}

/**
 * One aggregate query per page: counts of constraints / redemptions / recent redemptions plus
 * the fa/en descriptions for every coupon id. The cost is a single query no matter the page
 * size, so list rendering stays O(1) round-trips.
 */
async function fetchCouponListStats(ids: number[]): Promise<Map<number, CouponListStats>> {
    const out = new Map<number, CouponListStats>();
    if (ids.length === 0) return out;

    const result = await currentTrx().rawQuery<{
        rows: {
            coupon_id: string | number;
            products_count: string | number;
            categories_count: string | number;
            brands_count: string | number;
            emails_count: string | number;
            redemptions_count: string | number;
            recent_redemptions_7d: string | number;
            description_fa: string | null;
            description_en: string | null;
        }[];
    }>(
        `SELECT
            c.id AS coupon_id,
            (SELECT COUNT(*) FROM coupon_product_constraints WHERE coupon_id = c.id) AS products_count,
            (SELECT COUNT(*) FROM coupon_category_constraints WHERE coupon_id = c.id) AS categories_count,
            (SELECT COUNT(*) FROM coupon_brand_constraints WHERE coupon_id = c.id) AS brands_count,
            (SELECT COUNT(*) FROM coupon_email_restrictions WHERE coupon_id = c.id) AS emails_count,
            (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = c.id) AS redemptions_count,
            (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = c.id
                                                       AND redeemed_at >= now() - interval '7 days') AS recent_redemptions_7d,
            (SELECT description FROM coupon_translations WHERE coupon_id = c.id AND locale = 'fa' LIMIT 1) AS description_fa,
            (SELECT description FROM coupon_translations WHERE coupon_id = c.id AND locale = 'en' LIMIT 1) AS description_en
         FROM coupons c
         WHERE c.id = ANY (?::bigint[])`,
        [ids],
    );

    for (const row of result.rows) {
        out.set(Number(row.coupon_id), {
            productConstraintsCount: Number(row.products_count ?? 0),
            categoryConstraintsCount: Number(row.categories_count ?? 0),
            brandConstraintsCount: Number(row.brands_count ?? 0),
            emailRestrictionsCount: Number(row.emails_count ?? 0),
            redemptionsCount: Number(row.redemptions_count ?? 0),
            recentRedemptions7d: Number(row.recent_redemptions_7d ?? 0),
            descriptionFa: row.description_fa,
            descriptionEn: row.description_en,
        });
    }
    return out;
}

function notFound(): Exception {
    return new Exception("coupon not found", { status: 404, code: "E_NOT_FOUND" });
}
