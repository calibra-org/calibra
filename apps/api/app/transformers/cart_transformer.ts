import { BaseTransformer } from "@adonisjs/core/transformers";

import type Cart from "#models/cart";
import type CartItem from "#models/cart_item";
import type { CartTotalsResult } from "#services/cart_totals_service";
import type { ShippingRateOption } from "#services/shipping_rate_service";

/**
 * Composite view the {@link CartTransformer} receives. We bundle the cart with its preloaded items,
 * the computed totals, and the enumerated shipping options into one wrapper rather than reaching
 * into the model from a sibling transformer — keeps the envelope assembly in a single, grep-able
 * place.
 */
export interface CartView {
    cart: Cart;
    items: CartItem[];
    totals: CartTotalsResult;
    shippingOptions: ShippingRateOption[];
    locale: string;
}

interface ItemDisplay {
    name: string | null;
    sku: string | null;
    imageUrl: string | null;
}

/**
 * Owns the `/api/v1/cart/*` response shape. The contract is fixed: every endpoint (`GET`, `POST`,
 * `PATCH`, `DELETE`) returns the same `{data: {...full cart + totals}}` envelope so the SDK only
 * has to know one shape per resource. Money fields stay as integer minor units — display
 * formatting is the storefront's job.
 */
export default class CartTransformer extends BaseTransformer<CartView> {
    toObject() {
        const { cart, items, totals, shippingOptions, locale } = this.resource;

        return {
            id: Number(cart.id),
            token: cart.token,
            customer_id: cart.customerId === null ? null : Number(cart.customerId),
            currency: cart.currency,
            items: this.serializeItems(items, totals, locale),
            applied_coupons: [],
            shipping_rates: this.serializeShippingRates(
                shippingOptions,
                cart.shippingZoneMethodId === null ? null : Number(cart.shippingZoneMethodId),
            ),
            address: {
                country: cart.country ?? null,
                region_id: cart.regionId === null || cart.regionId === undefined ? null : Number(cart.regionId),
                postcode: cart.postcode ?? null,
            },
            totals: {
                items_total: totals.itemsTotal,
                items_tax_total: totals.itemsTaxTotal,
                shipping_total: totals.shippingTotal,
                shipping_tax_total: totals.shippingTaxTotal,
                discount_total: totals.discountTotal,
                discount_tax_total: totals.discountTaxTotal,
                tax_total: totals.taxTotal,
                grand_total: totals.grandTotal,
                needs_shipping: totals.needsShipping,
                needs_payment: totals.needsPayment,
            },
            created_at: cart.createdAt?.toISO() ?? null,
            updated_at: cart.updatedAt?.toISO() ?? null,
        };
    }

    private serializeItems(items: CartItem[], totals: CartTotalsResult, locale: string) {
        const totalsByLineId = new Map(totals.lines.map((line) => [line.id, line]));

        return items.map((item) => {
            const lineId = Number(item.id);
            const lineTotals = totalsByLineId.get(lineId);
            const display = resolveItemDisplay(item, locale);

            return {
                id: lineId,
                product_id: Number(item.productId),
                variation_id: item.variationId === null ? null : Number(item.variationId),
                name: display.name,
                sku: display.sku,
                image: display.imageUrl,
                price: Number(item.priceSnapshot),
                quantity: item.quantity,
                subtotal: lineTotals?.subtotal ?? 0,
                subtotal_tax: lineTotals?.subtotalTax ?? 0,
                total: lineTotals?.total ?? 0,
                total_tax: lineTotals?.totalTax ?? 0,
                attributes_snapshot: item.attributesSnapshot ?? {},
            };
        });
    }

    private serializeShippingRates(options: ShippingRateOption[], selectedId: number | null) {
        return options.map((option) => ({
            id: option.id,
            method_code: option.methodCode,
            title: option.title,
            total: option.cost,
            total_tax: 0,
            selected: selectedId === option.id,
        }));
    }
}

/**
 * Pick the storefront-facing display strings for a cart line from whatever the preloaded relations
 * carry. The line's product translation in the active locale wins; SKU and image fall back to the
 * variation when available, then to the parent product. Everything else is `null` rather than a
 * placeholder so the storefront knows to omit the missing field.
 */
function resolveItemDisplay(item: CartItem, locale: string): ItemDisplay {
    const product = (item as CartItem & { product?: unknown }).product as
        | undefined
        | {
              sku: string | null;
              translations?: Array<{ locale: string; name: string }>;
              images?: Array<{ position: number; media?: { url: string | null } | null }>;
          };
    const variation = (item as CartItem & { variation?: unknown }).variation as
        | undefined
        | {
              sku: string | null;
              imageMediaId?: bigint | number | null;
          };

    const translations = product?.translations ?? [];
    const matched = translations.find((row) => row.locale === locale) ?? translations[0] ?? null;
    const name = matched?.name ?? null;

    const sku = variation?.sku ?? product?.sku ?? null;

    const productImages = product?.images ?? [];
    const featured = productImages.find((image) => image.position === 0) ?? productImages[0] ?? null;
    const imageUrl = featured?.media?.url ?? null;

    return { name, sku, imageUrl };
}
