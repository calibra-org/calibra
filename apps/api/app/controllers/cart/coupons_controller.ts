import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import CartAppliedCoupon from "#models/cart_applied_coupon";
import CartItem from "#models/cart_item";
import type Product from "#models/product";
import ProductVariation from "#models/product_variation";
import { buildCartView, resolveCustomerContext } from "#services/cart_view_builder";
import { checkEligibility, countRedemptions, loadSnapshotByCode } from "#services/discounter_service";
import { resolvePrice } from "#services/price_resolver";
import CartTransformer from "#transformers/cart_transformer";
import { applyCouponValidator } from "#validators/coupons/apply_validator";

/**
 * Storefront-facing cart coupon endpoints. Apply runs full eligibility against the live cart state
 * BEFORE writing the `cart_applied_coupons` row — 422s give the customer a specific reason so the
 * UI can show "expired" instead of a generic "didn't work". Remove is a soft 404 when the code was
 * never applied; idempotent so the storefront can retry safely.
 */
export default class CartCouponsController {
    /**
     * `POST /api/v1/cart/coupons` — validates and applies the coupon. Soft-replays for an
     * already-applied code: returns 200 with the unchanged cart envelope so the storefront can
     * dedupe optimistically without surfacing a "duplicate" error.
     */
    async apply(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(applyCouponValidator);
        const snapshot = await loadSnapshotByCode(payload.code);
        if (!snapshot) {
            return this.errorResponse(ctx, 404, "not_found");
        }

        await ctx.cart.load("appliedCoupons");
        const already = ctx.cart.appliedCoupons.find((row) => Number(row.couponId) === snapshot.id);
        if (already) {
            return this.respond(ctx);
        }

        const customer = await resolveCustomerContext(ctx);
        const items = await loadDiscounterItems(ctx.cart);
        const itemsTotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);
        const otherIds = ctx.cart.appliedCoupons.map((row) => Number(row.couponId));

        const globalRedemptions = snapshot.usageLimitGlobal === null ? 0 : await countRedemptions(snapshot.id);
        const perUserRedemptions =
            snapshot.usageLimitPerUser === null
                ? 0
                : await countRedemptions(snapshot.id, {
                      customerId: customer.customerId,
                      email: customer.email,
                  });

        const eligibility = checkEligibility({
            coupon: snapshot,
            items,
            itemsTotal,
            otherAppliedCouponIds: otherIds,
            customer,
            globalRedemptionCount: globalRedemptions,
            perUserRedemptionCount: perUserRedemptions,
        });

        if (!eligibility.ok) {
            return this.errorResponse(ctx, 422, eligibility.reason, {
                code: snapshot.code,
                hint: eligibility.hint,
            });
        }

        await CartAppliedCoupon.create({
            cartId: ctx.cart.id,
            couponId: snapshot.id,
            codeSnapshot: snapshot.code,
        });

        return this.respond(ctx);
    }

    /**
     * `DELETE /api/v1/cart/coupons/:code` — removes the coupon row by case-insensitive match on
     * `code_snapshot`. Returns 404 when no such application exists so the storefront knows the
     * remove was a no-op rather than silently swallowing.
     */
    async remove(ctx: HttpContext) {
        const code = String(ctx.params.code ?? "").trim();
        if (!code) {
            throw new Exception("coupon code required", { status: 422, code: "E_VALIDATION_ERROR" });
        }
        const upper = code.toUpperCase();
        const row = await CartAppliedCoupon.query()
            .where("cart_id", Number(ctx.cart.id))
            .whereRaw("upper(code_snapshot) = ?", [upper])
            .first();
        if (!row) {
            return this.errorResponse(ctx, 404, "not_applied", { code: upper });
        }
        await row.delete();
        return this.respond(ctx);
    }

    private async respond(ctx: HttpContext) {
        const customer = await resolveCustomerContext(ctx);
        const view = await buildCartView(ctx.cart, ctx.i18n.locale, customer);
        return { data: new CartTransformer(view).toObject() };
    }

    private errorResponse(ctx: HttpContext, status: number, reason: string, extra: Record<string, unknown> = {}) {
        const body: Record<string, unknown> = {
            error: reason,
            message: ctx.i18n.t(`messages.errors.coupons.${reason}`, {}, reason),
            ...extra,
        };
        for (const key of Object.keys(body)) {
            if (body[key] === undefined) delete body[key];
        }
        return ctx.response.status(status).json(body);
    }
}

/**
 * Build the minimal {@link DiscounterItem} list off the cart for an apply eligibility check —
 * cheaper than re-running the full {@link buildCartView}, which would also recompute tax and
 * shipping. We need product category links and the live sale flag, so the load is preload-heavy.
 */
async function loadDiscounterItems(cart: { id: bigint | number }) {
    const lines = await CartItem.query()
        .where("cart_id", Number(cart.id))
        .preload("product", (q) => {
            q.preload("categories").preload("tags");
        });

    const variationIds = lines.filter((line) => line.variationId !== null).map((line) => Number(line.variationId));
    const variations =
        variationIds.length > 0 ? await ProductVariation.query().whereIn("id", variationIds) : ([] as ProductVariation[]);
    const variationsById = new Map(variations.map((v) => [Number(v.id), v]));

    return lines.map((line) => {
        const product = line.product as Product;
        const variation = line.variationId === null ? null : (variationsById.get(Number(line.variationId)) ?? null);
        const onSale = product ? resolvePrice(product, variation).onSale : false;
        return {
            lineKey: String(line.id),
            productId: Number(line.productId),
            variationId: line.variationId === null ? null : Number(line.variationId),
            quantity: line.quantity,
            priceSnapshot: Number(line.priceSnapshot),
            lineSubtotal: Number(line.priceSnapshot) * line.quantity,
            categoryIds: ((product?.categories ?? []) as Array<{ id: bigint | number }>).map((c) => Number(c.id)),
            tagIds: ((product?.tags ?? []) as Array<{ id: bigint | number }>).map((t) => Number(t.id)),
            onSale,
        };
    });
}
