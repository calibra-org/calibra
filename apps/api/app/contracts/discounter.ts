/**
 * Discount-engine contract. The active implementation is bound under the `discounter` key in
 * `providers/app_provider.ts`; consumers (cart_totals_service, order_finalizer) depend on this
 * interface only. Swapping the binding (e.g. {@link NoopDiscounter} in a test) is the supported
 * extension seam.
 *
 * @see {@link https://docs.adonisjs.com/guides/concepts/dependency-injection} for the container
 * binding pattern used by `providers/app_provider.ts`.
 */

/**
 * Item descriptor as the totals service sees it — only the keys a discount engine could legitimately
 * branch on are exposed, so the coupon engine cannot accidentally couple to private cart internals.
 */
export interface DiscounterItem {
    /** Stable identifier for the line; the totals service uses `cart_item.id` here. */
    lineKey: string;
    productId: number;
    variationId: number | null;
    quantity: number;
    /** Gross price-per-unit snapshot stored on the line at add-time. */
    priceSnapshot: number;
    /** Pre-discount line gross (quantity × priceSnapshot). */
    lineSubtotal: number;
    /** Category ids the line belongs to — used to match coupon category include/exclude constraints. */
    categoryIds: number[];
    /** Product tag ids the line carries — used to match coupon tag include/exclude lists. */
    tagIds: number[];
    /** True when `priceSnapshot` reflects an active sale price — drives `exclude_sale_items`. */
    onSale?: boolean;
}

export interface DiscounterCouponContext {
    /** PK on `coupons` for the code the customer applied to this cart. */
    id: number;
    /** Code snapshot the customer typed. Case-insensitive matches are the engine's job. */
    code: string;
}

/**
 * Optional viewer/customer context the discounter uses for per-user redemption counting and email
 * restriction matching. `null` denotes the anonymous/guest case during cart browsing — usage limits
 * are still re-checked at order submit when the email is captured.
 */
export interface DiscounterCustomerContext {
    customerId: number | null;
    email: string | null;
}

export interface DiscounterInput {
    items: DiscounterItem[];
    itemsTotal: number;
    appliedCoupons: DiscounterCouponContext[];
    customer?: DiscounterCustomerContext | null;
}

export interface DiscounterResult {
    /** Total of all discounts applied to line subtotals. */
    discountTotal: number;
    /** Tax portion of the applied discounts (for tax-inclusive carts). */
    discountTaxTotal: number;
    /** Set by `free_shipping` coupons; overrides every shipping option to 0. */
    freeShipping: boolean;
    /** Per-line discount allocation keyed by `DiscounterItem.lineKey`, in minor units. */
    perLineDiscounts: Map<string, number>;
}

export interface Discounter {
    /**
     * Compute the discount allocation for `input`. Pure with respect to the cart — engines should
     * not mutate the input or read from the request context. Database lookups (coupon-validity
     * checks, per-user redemption counts) are allowed but must be idempotent.
     */
    calculate(input: DiscounterInput): Promise<DiscounterResult>;
}

/**
 * Inert {@link Discounter} that returns zero discount, no free-shipping, and an empty allocation
 * map. Use it in tests that need totals math without exercising the coupon engine — rebind via
 * `setDiscounter()` and restore in `afterEach`.
 */
export class NoopDiscounter implements Discounter {
    async calculate(): Promise<DiscounterResult> {
        return {
            discountTotal: 0,
            discountTaxTotal: 0,
            freeShipping: false,
            perLineDiscounts: new Map(),
        };
    }
}

export const noopDiscounter: Discounter = new NoopDiscounter();
