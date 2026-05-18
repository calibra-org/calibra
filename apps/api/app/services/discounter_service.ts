import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import type {
    Discounter,
    DiscounterCouponContext,
    DiscounterCustomerContext,
    DiscounterInput,
    DiscounterItem,
    DiscounterResult,
} from "#contracts/discounter";
import Coupon, { type CouponDiscountType } from "#models/coupon";
import CouponCategoryConstraint from "#models/coupon_category_constraint";
import CouponEmailRestriction from "#models/coupon_email_restriction";
import CouponProductConstraint from "#models/coupon_product_constraint";

/**
 * Stable failure codes returned to the controller. Controllers look up the localized message via
 * `i18n.t('messages.errors.coupons.${reason}')`. Exhaustive list — adding a check means adding a
 * value here AND a translation in `resources/lang/{fa,en}/messages.json` (Adonis prefixes lookup
 * keys with the catalog filename).
 */
export type CouponIneligibilityReason =
    | "disabled"
    | "not_yet_active"
    | "expired"
    | "below_minimum"
    | "above_maximum"
    | "no_eligible_items"
    | "only_sale_items"
    | "individual_use_conflict"
    | "email_not_allowed"
    | "usage_limit_global_reached"
    | "usage_limit_per_user_reached";

export interface EligibilityOk {
    ok: true;
}

export interface EligibilityFail {
    ok: false;
    reason: CouponIneligibilityReason;
    hint?: string;
}

export type EligibilityResult = EligibilityOk | EligibilityFail;

/**
 * Snapshot view of a coupon row + its constraint sets. Built once per eligibility/discount run so
 * the math layer doesn't keep an ORM model around (the integration test that stubs orders cannot
 * round-trip a Lucid model cleanly).
 */
export interface CouponSnapshot {
    id: number;
    code: string;
    discountType: CouponDiscountType;
    amountMinor: number | null;
    amountPercent: number | null;
    status: "active" | "disabled";
    startsAt: DateTime | null;
    expiresAt: DateTime | null;
    minimumAmount: number | null;
    maximumAmount: number | null;
    individualUse: boolean;
    excludeSaleItems: boolean;
    usageLimitGlobal: number | null;
    usageLimitPerUser: number | null;
    limitUsageToXItems: number | null;
    freeShipping: boolean;
    productConstraints: ReadonlyArray<{ productId: number; mode: "include" | "exclude" }>;
    categoryConstraints: ReadonlyArray<{ categoryId: number; mode: "include" | "exclude" }>;
    emailRestrictions: ReadonlyArray<string>;
}

/**
 * Real Discounter — the one phase 04 left {@link NoopDiscounter} stubbed for. Bound under the
 * `discounter` container key in `providers/app_provider.ts`; everything else (cart_totals_service,
 * cart_controller) keeps depending on the interface.
 */
export default class DiscounterService implements Discounter {
    async calculate(input: DiscounterInput): Promise<DiscounterResult> {
        if (input.appliedCoupons.length === 0 || input.items.length === 0) {
            return emptyResult();
        }

        const snapshots = await loadSnapshots(input.appliedCoupons);
        return computeDiscounts(input, snapshots);
    }
}

/**
 * Reusable pure entry point — no DB. The cart controller resolves coupon snapshots once and feeds
 * the same data structure to {@link checkEligibility} and to the discount math; unit tests build
 * snapshots by hand instead of seeding rows. Mirrors the structure of `calculateTax` /
 * `calculateCartTotals` from phase 04.
 */
export function computeDiscounts(input: DiscounterInput, snapshots: CouponSnapshot[]): DiscounterResult {
    const perLine = new Map<string, number>();
    /**
     * Running remaining eligible subtotal per line — `fixed_product → percent → fixed_cart` order
     * means each subsequent stage discounts what's left after the prior ones. Initialized to the
     * raw line subtotal so a single percent coupon over an empty earlier stage still has the full
     * basket to chew through.
     */
    const remaining = new Map<string, number>();
    for (const item of input.items) {
        remaining.set(item.lineKey, item.lineSubtotal);
    }

    /** Honour `individual_use`: the first individual_use coupon wins, others are silently dropped. */
    const orderedCoupons = sortCouponsByType(snapshots);
    const active = pickActiveCoupons(orderedCoupons);

    let freeShipping = false;
    for (const coupon of active) {
        if (coupon.freeShipping || coupon.discountType === "free_shipping") {
            freeShipping = true;
        }
        if (coupon.discountType === "free_shipping") continue;
        applyCouponToLines(coupon, input.items, remaining, perLine);
    }

    const discountTotal = sumMapValues(perLine);
    return {
        discountTotal,
        discountTaxTotal: 0,
        freeShipping,
        perLineDiscounts: perLine,
    };
}

/**
 * Test the coupon against the current cart + viewer context. Pure, sync — the caller pre-loads the
 * snapshot + any per-user/global redemption counts and passes them in. The cart-apply controller
 * uses this to fail-fast on bad codes; the order_finalizer uses the same routine inside the
 * `FOR UPDATE` window to catch races.
 */
export function checkEligibility(args: {
    coupon: CouponSnapshot;
    items: ReadonlyArray<DiscounterItem>;
    itemsTotal: number;
    otherAppliedCouponIds: ReadonlyArray<number>;
    customer: DiscounterCustomerContext | null;
    globalRedemptionCount: number;
    perUserRedemptionCount: number;
    now?: DateTime;
}): EligibilityResult {
    const now = args.now ?? DateTime.utc();

    if (args.coupon.status !== "active") return { ok: false, reason: "disabled" };
    if (args.coupon.startsAt && now < args.coupon.startsAt) return { ok: false, reason: "not_yet_active" };
    if (args.coupon.expiresAt && now > args.coupon.expiresAt) return { ok: false, reason: "expired" };

    if (args.coupon.minimumAmount !== null && args.itemsTotal < args.coupon.minimumAmount) {
        return { ok: false, reason: "below_minimum", hint: String(args.coupon.minimumAmount) };
    }
    if (args.coupon.maximumAmount !== null && args.itemsTotal > args.coupon.maximumAmount) {
        return { ok: false, reason: "above_maximum", hint: String(args.coupon.maximumAmount) };
    }

    const eligibleItems = args.items.filter((item) => isItemEligible(item, args.coupon));
    if (eligibleItems.length === 0) {
        return { ok: false, reason: "no_eligible_items" };
    }
    if (args.coupon.excludeSaleItems && eligibleItems.every((item) => item.onSale)) {
        return { ok: false, reason: "only_sale_items" };
    }

    if (args.coupon.individualUse && args.otherAppliedCouponIds.length > 0) {
        return { ok: false, reason: "individual_use_conflict" };
    }

    if (args.coupon.emailRestrictions.length > 0) {
        const email = args.customer?.email?.toLowerCase() ?? null;
        if (!email || !args.coupon.emailRestrictions.some((pattern) => matchEmailPattern(pattern, email))) {
            return { ok: false, reason: "email_not_allowed" };
        }
    }

    if (args.coupon.usageLimitGlobal !== null && args.globalRedemptionCount >= args.coupon.usageLimitGlobal) {
        return { ok: false, reason: "usage_limit_global_reached" };
    }
    if (args.coupon.usageLimitPerUser !== null && args.perUserRedemptionCount >= args.coupon.usageLimitPerUser) {
        return { ok: false, reason: "usage_limit_per_user_reached" };
    }

    return { ok: true };
}

/**
 * Load every coupon (with constraints + email restrictions) referenced by the cart in a single
 * query batch. Returns snapshots keyed by coupon id; codes resolve case-insensitively via the
 * citext column.
 */
export async function loadSnapshots(
    contexts: ReadonlyArray<DiscounterCouponContext>,
    client?: TransactionClientContract,
): Promise<CouponSnapshot[]> {
    if (contexts.length === 0) return [];

    const ids = contexts.map((c) => c.id);
    const couponsQuery = Coupon.query({ client }).whereIn("id", ids);
    const coupons = await couponsQuery;

    const productConstraints = await CouponProductConstraint.query({ client }).whereIn("coupon_id", ids);
    const categoryConstraints = await CouponCategoryConstraint.query({ client }).whereIn("coupon_id", ids);
    const emailRestrictions = await CouponEmailRestriction.query({ client }).whereIn("coupon_id", ids);

    return coupons.map((coupon) => toSnapshot(coupon, productConstraints, categoryConstraints, emailRestrictions));
}

/**
 * Load a single coupon by code (case-insensitive thanks to citext) including its constraint sets.
 * Used by the cart apply endpoint as well as the order finalizer's re-validation step. Returns
 * `null` when the code does not exist or the row is soft-deleted.
 */
export async function loadSnapshotByCode(code: string, client?: TransactionClientContract): Promise<CouponSnapshot | null> {
    const normalized = code.trim();
    if (!normalized) return null;
    const coupon = await Coupon.query({ client }).where("code", normalized).whereNull("deleted_at").first();
    if (!coupon) return null;

    const couponId = Number(coupon.id);
    const productConstraints = await CouponProductConstraint.query({ client }).where("coupon_id", couponId);
    const categoryConstraints = await CouponCategoryConstraint.query({ client }).where("coupon_id", couponId);
    const emailRestrictions = await CouponEmailRestriction.query({ client }).where("coupon_id", couponId);

    return toSnapshot(coupon, productConstraints, categoryConstraints, emailRestrictions);
}

/**
 * Lock the coupon row + read constraints inside an existing transaction. Used by the order
 * finalizer to take a `FOR UPDATE` lock before re-validating limits, so concurrent submits cannot
 * both pass the limit check.
 */
export async function loadSnapshotForUpdate(couponId: number, trx: TransactionClientContract): Promise<CouponSnapshot | null> {
    const coupon = await Coupon.query({ client: trx }).where("id", couponId).whereNull("deleted_at").forUpdate().first();
    if (!coupon) return null;

    const productConstraints = await CouponProductConstraint.query({ client: trx }).where("coupon_id", couponId);
    const categoryConstraints = await CouponCategoryConstraint.query({ client: trx }).where("coupon_id", couponId);
    const emailRestrictions = await CouponEmailRestriction.query({ client: trx }).where("coupon_id", couponId);

    return toSnapshot(coupon, productConstraints, categoryConstraints, emailRestrictions);
}

/**
 * Count completed redemptions for the coupon. Optional transaction client + customer/email scope
 * so the finalizer counts inside its `FOR UPDATE` window — that's the only way the limit check is
 * race-safe.
 */
export async function countRedemptions(
    couponId: number,
    options: { client?: TransactionClientContract; customerId?: number | null; email?: string | null } = {},
): Promise<number> {
    const query = (options.client ?? db).from("coupon_redemptions").where("coupon_id", couponId);
    if (options.customerId !== undefined || options.email !== undefined) {
        query.andWhere((q) => {
            if (options.customerId !== undefined && options.customerId !== null) {
                q.orWhere("customer_id", options.customerId);
            }
            if (options.email) {
                q.orWhereRaw("lower(email_snapshot) = lower(?)", [options.email]);
            }
        });
    }
    const rows = await query.count("* as count");
    const row = rows[0] ?? { count: 0 };
    return Number((row as { count: number | string }).count);
}

/**
 * Map a Lucid coupon + its constraint rows to the immutable {@link CouponSnapshot}. Centralized so
 * field renames in the model don't ripple into every caller, and so the discounter has a single
 * understanding of "what does a coupon look like at compute time."
 */
function toSnapshot(
    coupon: Coupon,
    productConstraints: ReadonlyArray<CouponProductConstraint>,
    categoryConstraints: ReadonlyArray<CouponCategoryConstraint>,
    emailRestrictions: ReadonlyArray<CouponEmailRestriction>,
): CouponSnapshot {
    return {
        id: Number(coupon.id),
        code: coupon.code,
        discountType: coupon.discountType as CouponDiscountType,
        amountMinor: coupon.amountMinor === null ? null : Number(coupon.amountMinor),
        amountPercent: coupon.amountPercent === null ? null : Number.parseFloat(String(coupon.amountPercent)),
        status: coupon.status as "active" | "disabled",
        startsAt: coupon.startsAt ?? null,
        expiresAt: coupon.expiresAt ?? null,
        minimumAmount: coupon.minimumAmount === null ? null : Number(coupon.minimumAmount),
        maximumAmount: coupon.maximumAmount === null ? null : Number(coupon.maximumAmount),
        individualUse: coupon.individualUse,
        excludeSaleItems: coupon.excludeSaleItems,
        usageLimitGlobal: coupon.usageLimitGlobal,
        usageLimitPerUser: coupon.usageLimitPerUser,
        limitUsageToXItems: coupon.limitUsageToXItems,
        freeShipping: coupon.freeShipping,
        productConstraints: productConstraints
            .filter((c) => Number(c.couponId) === Number(coupon.id))
            .map((c) => ({ productId: Number(c.productId), mode: c.mode as "include" | "exclude" })),
        categoryConstraints: categoryConstraints
            .filter((c) => Number(c.couponId) === Number(coupon.id))
            .map((c) => ({ categoryId: Number(c.categoryId), mode: c.mode as "include" | "exclude" })),
        emailRestrictions: emailRestrictions.filter((c) => Number(c.couponId) === Number(coupon.id)).map((c) => c.emailPattern),
    };
}

/**
 * Apply one coupon to the running remaining-subtotal map. Delegates to the per-type implementation
 * so each shape (fixed_product, percent, fixed_cart, free_shipping) has a single readable branch.
 */
function applyCouponToLines(
    coupon: CouponSnapshot,
    items: ReadonlyArray<DiscounterItem>,
    remaining: Map<string, number>,
    perLine: Map<string, number>,
): void {
    const eligible = items.filter((item) => isItemEligible(item, coupon));
    if (eligible.length === 0) return;
    if (coupon.excludeSaleItems && eligible.every((item) => item.onSale)) return;

    switch (coupon.discountType) {
        case "fixed_product":
            applyFixedProduct(coupon, eligible, remaining, perLine);
            return;
        case "percent":
            applyPercent(coupon, eligible, remaining, perLine);
            return;
        case "fixed_cart":
            applyFixedCart(coupon, eligible, remaining, perLine);
            return;
        case "free_shipping":
            return;
    }
}

function applyFixedProduct(
    coupon: CouponSnapshot,
    eligible: ReadonlyArray<DiscounterItem>,
    remaining: Map<string, number>,
    perLine: Map<string, number>,
): void {
    const per = coupon.amountMinor ?? 0;
    if (per <= 0) return;
    /** `limit_usage_to_x_items` caps the unit count across eligible lines, filled greedily by line order. */
    let remainingUnits = coupon.limitUsageToXItems ?? Number.POSITIVE_INFINITY;
    for (const item of eligible) {
        if (coupon.excludeSaleItems && item.onSale) continue;
        if (remainingUnits <= 0) break;
        const units = Math.min(item.quantity, remainingUnits);
        const lineMax = remaining.get(item.lineKey) ?? 0;
        const discount = Math.min(per * units, lineMax);
        if (discount <= 0) continue;
        addLineDiscount(item.lineKey, discount, remaining, perLine);
        remainingUnits -= units;
    }
}

function applyPercent(
    coupon: CouponSnapshot,
    eligible: ReadonlyArray<DiscounterItem>,
    remaining: Map<string, number>,
    perLine: Map<string, number>,
): void {
    const percent = coupon.amountPercent ?? 0;
    if (percent <= 0) return;
    let remainingUnits = coupon.limitUsageToXItems ?? Number.POSITIVE_INFINITY;
    for (const item of eligible) {
        if (coupon.excludeSaleItems && item.onSale) continue;
        if (remainingUnits <= 0) break;
        const units = Math.min(item.quantity, remainingUnits);
        const unitPrice = item.priceSnapshot;
        const lineRemaining = remaining.get(item.lineKey) ?? 0;
        if (lineRemaining <= 0) continue;
        /**
         * Compute the discount against the eligible *units* (not the whole line) so
         * `limit_usage_to_x_items` interacts sensibly with quantity > 1 lines.
         */
        const basis = Math.min(unitPrice * units, lineRemaining);
        const discount = Math.round((basis * percent) / 100);
        const clipped = Math.min(discount, lineRemaining);
        if (clipped <= 0) continue;
        addLineDiscount(item.lineKey, clipped, remaining, perLine);
        remainingUnits -= units;
    }
}

function applyFixedCart(
    coupon: CouponSnapshot,
    eligible: ReadonlyArray<DiscounterItem>,
    remaining: Map<string, number>,
    perLine: Map<string, number>,
): void {
    const target = coupon.amountMinor ?? 0;
    if (target <= 0) return;

    const eligibleEntries = eligible
        .map((item) => ({ item, remaining: remaining.get(item.lineKey) ?? 0 }))
        .filter((entry) => entry.remaining > 0);
    if (eligibleEntries.length === 0) return;

    const totalRemaining = eligibleEntries.reduce((sum, entry) => sum + entry.remaining, 0);
    /** Coupon worth more than the cart? Cap at what's actually discountable so per-line never overshoots. */
    const cap = Math.min(target, totalRemaining);

    const allocations: { lineKey: string; amount: number }[] = [];
    let allocated = 0;
    for (const entry of eligibleEntries) {
        const portion = Math.floor((entry.remaining * cap) / totalRemaining);
        const clipped = Math.min(portion, entry.remaining);
        allocations.push({ lineKey: entry.item.lineKey, amount: clipped });
        allocated += clipped;
    }

    /** Rounding residual → assign to the line with the largest remaining subtotal that has room. */
    let residual = cap - allocated;
    if (residual > 0) {
        const ordered = eligibleEntries
            .map((entry) => ({ entry, alloc: allocations.find((a) => a.lineKey === entry.item.lineKey)! }))
            .sort((a, b) => b.entry.remaining - a.entry.remaining);
        for (const { entry, alloc } of ordered) {
            if (residual <= 0) break;
            const room = entry.remaining - alloc.amount;
            if (room <= 0) continue;
            const give = Math.min(room, residual);
            alloc.amount += give;
            residual -= give;
        }
    }

    for (const allocation of allocations) {
        if (allocation.amount <= 0) continue;
        addLineDiscount(allocation.lineKey, allocation.amount, remaining, perLine);
    }
}

function addLineDiscount(lineKey: string, amount: number, remaining: Map<string, number>, perLine: Map<string, number>): void {
    perLine.set(lineKey, (perLine.get(lineKey) ?? 0) + amount);
    remaining.set(lineKey, Math.max(0, (remaining.get(lineKey) ?? 0) - amount));
}

/**
 * Match an item against include/exclude product+category constraints. An empty constraint set means
 * "everything qualifies"; an explicit `include` set means the line must hit at least one of them;
 * an `exclude` hit disqualifies the line outright.
 */
function isItemEligible(item: DiscounterItem, coupon: CouponSnapshot): boolean {
    const productIncludes = coupon.productConstraints.filter((c) => c.mode === "include");
    const productExcludes = coupon.productConstraints.filter((c) => c.mode === "exclude");
    const categoryIncludes = coupon.categoryConstraints.filter((c) => c.mode === "include");
    const categoryExcludes = coupon.categoryConstraints.filter((c) => c.mode === "exclude");

    if (productExcludes.some((c) => c.productId === item.productId)) return false;
    if (categoryExcludes.some((c) => item.categoryIds.includes(c.categoryId))) return false;

    const hasProductInclude = productIncludes.length > 0;
    const hasCategoryInclude = categoryIncludes.length > 0;
    if (!hasProductInclude && !hasCategoryInclude) return true;

    const productMatch = hasProductInclude && productIncludes.some((c) => c.productId === item.productId);
    const categoryMatch = hasCategoryInclude && categoryIncludes.some((c) => item.categoryIds.includes(c.categoryId));
    /**
     * Match either set when present — the WC convention is that include lists are unioned, not
     * intersected, so a coupon "for product A OR category B" works as customers expect.
     */
    return productMatch || categoryMatch;
}

function matchEmailPattern(pattern: string, email: string): boolean {
    const normalized = pattern.trim().toLowerCase();
    if (normalized === email) return true;
    if (!normalized.includes("*")) return false;
    /** Convert glob to regex: escape the rest, then turn `*` into `.*`. */
    const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(email);
}

function sortCouponsByType(snapshots: ReadonlyArray<CouponSnapshot>): CouponSnapshot[] {
    const order: Record<CouponDiscountType, number> = {
        fixed_product: 0,
        percent: 1,
        fixed_cart: 2,
        free_shipping: 3,
    };
    return snapshots.slice().sort((a, b) => order[a.discountType] - order[b.discountType]);
}

/**
 * Resolve `individual_use`: if any active coupon flags individual_use, only that single coupon
 * stays in the run. Earliest in the sorted order wins so the result is deterministic regardless of
 * the order the customer typed codes.
 */
function pickActiveCoupons(orderedCoupons: ReadonlyArray<CouponSnapshot>): CouponSnapshot[] {
    const individual = orderedCoupons.find((c) => c.individualUse);
    return individual ? [individual] : orderedCoupons.slice();
}

function sumMapValues(map: Map<string, number>): number {
    let total = 0;
    for (const value of map.values()) total += value;
    return total;
}

function emptyResult(): DiscounterResult {
    return {
        discountTotal: 0,
        discountTaxTotal: 0,
        freeShipping: false,
        perLineDiscounts: new Map(),
    };
}
