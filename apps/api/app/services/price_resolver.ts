import { DateTime } from "luxon";

import type Product from "#models/product";
import type ProductVariation from "#models/product_variation";

export interface ResolvedPrice {
    regularPrice: bigint | number | null;
    /** The price the customer pays. Falls back to `regularPrice` outside the sale window. */
    effectivePrice: bigint | number | null;
    /** True if the sale price is currently active. */
    onSale: boolean;
}

/**
 * Resolve the effective price for a product or variation at a given instant. Sale prices apply
 * only when (a) `sale_price` is set, (b) `sale_starts_at` is null or in the past, (c)
 * `sale_ends_at` is null or in the future. A variation's own price always overrides the parent
 * product's when present; only fields the variation leaves null fall back to the product.
 */
export function resolvePrice(
    product: Pick<Product, "regularPrice" | "salePrice" | "saleStartsAt" | "saleEndsAt">,
    variation?: Pick<ProductVariation, "regularPrice" | "salePrice" | "saleStartsAt" | "saleEndsAt"> | null,
    now: DateTime = DateTime.utc(),
): ResolvedPrice {
    const regular = variation?.regularPrice ?? product.regularPrice;
    const sale = variation?.salePrice ?? product.salePrice;
    const startsAt = variation?.saleStartsAt ?? product.saleStartsAt;
    const endsAt = variation?.saleEndsAt ?? product.saleEndsAt;

    const saleActive = sale !== null && sale !== undefined && withinWindow(now, startsAt, endsAt);
    return {
        regularPrice: regular ?? null,
        effectivePrice: saleActive ? sale : (regular ?? null),
        onSale: saleActive,
    };
}

function withinWindow(now: DateTime, startsAt: DateTime | null, endsAt: DateTime | null): boolean {
    if (startsAt && now < startsAt) return false;
    if (endsAt && now > endsAt) return false;
    return true;
}
