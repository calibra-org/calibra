import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import Coupon from "#models/coupon";
import CouponCategoryConstraint from "#models/coupon_category_constraint";
import CouponEmailRestriction from "#models/coupon_email_restriction";
import CouponProductConstraint from "#models/coupon_product_constraint";
import CouponRedemption from "#models/coupon_redemption";
import CouponTranslation from "#models/coupon_translation";
import { paginated, resource } from "#transformers/api_envelope";
import CouponRedemptionTransformer from "#transformers/coupon_redemption_transformer";
import CouponTransformer from "#transformers/coupon_transformer";
import { batchCouponValidator, createCouponValidator, updateCouponValidator } from "#validators/coupons/coupon_validator";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

type CreatePayload = Awaited<ReturnType<typeof createCouponValidator.validate>>;
type UpdatePayload = Awaited<ReturnType<typeof updateCouponValidator.validate>>;

/**
 * Admin CRUD over `coupons`. Soft-delete blocks future redemptions but preserves history (the
 * coupon stays joinable from `coupon_redemptions` for reporting). Updates are non-retroactive —
 * existing redemptions keep the discount they were created with, and only future cart applies see
 * the new amount/percent.
 */
export default class AdminCouponsController {
    async index(ctx: HttpContext) {
        const page = Math.max(1, Number(ctx.request.input("page", 1)) || 1);
        const perPage = Math.min(
            PAGE_SIZE_MAX,
            Math.max(1, Number(ctx.request.input("perPage", PAGE_SIZE_DEFAULT)) || PAGE_SIZE_DEFAULT),
        );
        const status = ctx.request.input("status");
        const search = String(ctx.request.input("search", "")).trim();

        const query = Coupon.query().whereNull("deleted_at").orderBy("created_at", "desc");
        if (status) query.where("status", String(status));
        if (search) query.whereILike("code", `%${search}%`);

        const paginator = await query.paginate(page, perPage);
        return paginated(CouponTransformer.transform(paginator.all()).useVariant("forList"), paginator);
    }

    async show(ctx: HttpContext) {
        const coupon = await this.loadWithRelations(Number(ctx.params.id));
        if (!coupon) throw notFound();
        return resource(CouponTransformer.transform(coupon).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createCouponValidator);
        const coupon = await db.transaction(async (trx) => {
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

        await db.transaction(async (trx) => {
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

        await db.transaction(async (trx) => {
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
            .preload("emailRestrictions")
            .first();
    }
}

function notFound(): Exception {
    return new Exception("coupon not found", { status: 404, code: "E_NOT_FOUND" });
}
