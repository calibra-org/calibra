/**
 * Contract phase 06 will swap a real {@link CouponDiscounter} into. Phase 04 ships
 * {@link NoopDiscounter} so the totals pipeline can be wired end-to-end before coupons land. The
 * container binding under the `discounter` key lets the rest of the app stay agnostic of which
 * implementation is active.
 *
 * @see {@link https://docs.adonisjs.com/guides/concepts/dependency-injection} for the container
 * binding pattern used by `providers/app_provider.ts`.
 */

/**
 * Item descriptor as the totals service sees it — only the keys a discount engine could legitimately
 * branch on are exposed, so phase 06's coupon logic cannot accidentally couple to private cart
 * internals.
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
    /** Optional category ids the line belongs to — phase 06 uses these for category constraints. */
    categoryIds: number[];
    /** Optional product tags the line carries — phase 06 uses these for include/exclude lists. */
    tagIds: number[];
}

export interface DiscounterCouponContext {
    /** PK on `coupons` once phase 06 wires the table. Phase 04 leaves this empty. */
    id: number;
    /** Code snapshot the customer typed. Case-insensitive matches are the engine's job. */
    code: string;
}

export interface DiscounterInput {
    items: DiscounterItem[];
    itemsTotal: number;
    appliedCoupons: DiscounterCouponContext[];
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
 * Phase 04's placeholder. Returns zero discount, zero free-shipping, empty allocation map. Phase 06
 * replaces the container binding with `CouponDiscounter` and this class is unbound.
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
