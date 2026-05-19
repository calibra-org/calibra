import type { HttpContext } from "@adonisjs/core/http";

import type { DiscounterCouponContext, DiscounterCustomerContext } from "#contracts/discounter";
import type Cart from "#models/cart";
import Customer from "#models/customer";
import { type CartTotalsItem, type CartTotalsResult, computeCartTotals } from "#services/cart_totals_service";
import { getDiscounter } from "#services/discounter";
import { resolvePrice } from "#services/price_resolver";
import SettingsService from "#services/settings_service";
import { enumerateShippingRates } from "#services/shipping_rate_service";
import type { CartView } from "#transformers/cart_transformer";

const settingsService = new SettingsService();

/**
 * Assemble the {@link CartView} the {@link CartTransformer} needs. Shared between every endpoint
 * that returns the cart envelope (cart controller, coupons controller, checkout draft) so they
 * don't duplicate the preload + totals dance.
 *
 * Preloads cart relations, runs the active discounter against the cart's applied coupons, and
 * computes totals. Also keeps the cart's currency in sync with the configured default and clears
 * `shippingZoneMethodId` if the previously-selected rate is no longer eligible.
 */
export async function buildCartView(
    cart: Cart,
    locale: string,
    customer: DiscounterCustomerContext | null = null,
): Promise<CartView> {
    await cart.load("items", (q) => {
        q.orderBy("id", "asc")
            .preload("product", (productQuery) => {
                productQuery
                    .preload("translations")
                    .preload("categories")
                    .preload("tags")
                    .preload("images", (img) => {
                        img.orderBy("position", "asc").preload("media");
                    });
            })
            .preload("variation");
    });
    await cart.load("appliedCoupons");

    const pricesIncludeTax = await settingsService.get<boolean>("tax", "prices_include_tax", true);
    const currency = await settingsService.get<string>("general", "currency", "IRR");
    if (cart.currency !== currency) {
        cart.currency = currency;
        await cart.save();
    }

    const items = cart.items.map<CartTotalsItem>((line) => {
        const product = line.product;
        const variation = line.variationId === null ? null : line.variation;
        const requiresShipping = product ? !product.virtual : true;
        const taxStatus = (product?.taxStatus ?? "taxable") as CartTotalsItem["taxStatus"];
        const taxClassId = resolveTaxClassId(product, variation);
        const onSale = product ? resolvePrice(product, variation).onSale : false;
        const categoryIds = (product?.categories ?? []).map((c) => Number(c.id));
        const tagIds = (product?.tags ?? []).map((t) => Number(t.id));
        return {
            lineKey: String(line.id),
            id: Number(line.id),
            productId: Number(line.productId),
            variationId: line.variationId === null ? null : Number(line.variationId),
            quantity: line.quantity,
            priceSnapshot: Number(line.priceSnapshot),
            taxClassId,
            taxStatus,
            requiresShipping,
            categoryIds,
            tagIds,
            onSale,
        };
    });

    const address = cart.country
        ? {
              country: cart.country,
              regionId: cart.regionId === null ? null : Number(cart.regionId),
          }
        : null;

    const itemsTotalGross = items.reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0);
    const shippingAddress = cart.country
        ? {
              country: cart.country,
              regionId: cart.regionId === null ? null : Number(cart.regionId),
              postcode: cart.postcode,
          }
        : null;
    const shippingOptions = shippingAddress ? await enumerateShippingRates(shippingAddress, itemsTotalGross) : [];

    let selectedRateId = cart.shippingZoneMethodId === null ? null : Number(cart.shippingZoneMethodId);
    if (selectedRateId !== null && !shippingOptions.some((option) => option.id === selectedRateId)) {
        cart.shippingZoneMethodId = null;
        await cart.save();
        selectedRateId = null;
    }

    const appliedCoupons: DiscounterCouponContext[] = cart.appliedCoupons.map((row) => ({
        id: Number(row.couponId),
        code: row.codeSnapshot,
    }));

    const totals: CartTotalsResult = await computeCartTotals({
        items,
        address,
        selectedRateId,
        discounter: getDiscounter(),
        pricesIncludeTax,
        shippingOptions,
        appliedCoupons,
        customer,
    });

    return {
        cart,
        items: cart.items,
        appliedCoupons: cart.appliedCoupons,
        totals,
        shippingOptions,
        locale,
    };
}

/**
 * Resolve viewer/customer context the discounter uses for per-user redemption counts + email
 * restrictions. Pulls the customer id off `ctx.cart` (set by the cart middleware) and the email
 * off the auth user when present. Anonymous carts return `{ customerId: null, email: null }` so the
 * discounter still runs its global-only checks.
 */
export async function resolveCustomerContext(ctx: HttpContext): Promise<DiscounterCustomerContext> {
    const customerId = ctx.cart?.customerId === null || ctx.cart?.customerId === undefined ? null : Number(ctx.cart.customerId);
    let email: string | null = ctx.auth.user?.email ?? null;
    if (!email && customerId !== null) {
        const customer = await Customer.query().where("id", customerId).preload("user").first();
        email = customer?.user?.email ?? null;
    }
    return { customerId, email };
}

function resolveTaxClassId(
    product: { taxClassId?: bigint | number | null } | null | undefined,
    variation: { taxClassId?: bigint | number | null } | null | undefined,
): number | null {
    const variationClass = variation?.taxClassId;
    if (variationClass !== undefined && variationClass !== null) return Number(variationClass);
    const productClass = product?.taxClassId;
    if (productClass !== undefined && productClass !== null) return Number(productClass);
    return null;
}
