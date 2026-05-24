import { randomBytes } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

import { OrderStatus } from "#enums/order_status";
import type Cart from "#models/cart";
import CartItem from "#models/cart_item";
import CouponRedemption from "#models/coupon_redemption";
import type CustomerAddress from "#models/customer_address";
import CustomerIranProfile from "#models/customer_iran_profile";
import type Order from "#models/order";
import OrderAddress from "#models/order_address";
import OrderAddressIranExtension from "#models/order_address_iran_extension";
import OrderCouponLine from "#models/order_coupon_line";
import OrderLineItem from "#models/order_line_item";
import type User from "#models/user";
import { checkEligibility, countRedemptions, loadSnapshotForUpdate } from "#services/discounter_service";
import { OrderFactory } from "#services/order_factory";
import { orderStateMachine } from "#services/order_state_machine";

const ORDER_KEY_BYTES = 20;

export interface FinalizeOptions {
    /** Header value the submit middleware lifted off `Idempotency-Key` (if any). */
    idempotencyKey?: string | null;
    /** Acting user when the submit came from `auth` middleware; null for guest submits. */
    actor?: User | null;
    /** Active locale, used when snapshotting product names. */
    locale?: string;
    /** Optional IP / UA for forensic stamping. */
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface FinalizeResult {
    order: Order;
    /**
     * Snapshot of the selected payment gateway plus a `redirectUrl`. The finalizer leaves
     * `redirectUrl` as `null`; storefronts then call `POST /payment/init/:orderKey` to ask the
     * matching gateway adapter for a hosted-checkout URL (or null for non-redirecting methods like
     * bank-transfer).
     */
    payment: { gateway: { id: number | null; code: string | null }; redirectUrl: string | null };
}

/**
 * `OrderFinalizer` runs the `draft → pending` transition. It owns the full transaction so a
 * mid-flow failure (out of stock, price drift, FK error) rolls back atomically — no half-finalized
 * orders, no stock decrements without an order, no idempotency key written on failure.
 *
 * Step list:
 * 1. Look up the draft (existing or fresh) and re-validate it has lines + payment + addresses.
 * 2. Open the transaction.
 * 3. Re-snapshot prices and surface 409 `price_changed` on drift.
 * 4. Reserve stock via the state machine (locks `inventory_items` rows `FOR UPDATE`).
 * 5. Stamp `order_key`, `idempotency_key`, `ip_address`, `user_agent`.
 * 6. Transition `draft → pending` (writes audit row, emits `OrderPlaced`).
 * 7. Commit.
 * 8. Clear the source cart (outside the transaction; non-blocking forensics).
 */
export class OrderFinalizer {
    constructor(private readonly factory = new OrderFactory()) {}

    async finalize(cart: Cart, draft: Order, opts: FinalizeOptions = {}): Promise<FinalizeResult> {
        if (draft.status !== OrderStatus.Draft) {
            throw new Exception("Order is no longer a draft", {
                status: 409,
                code: "E_ORDER_NOT_DRAFT",
            });
        }

        await draft.load("billingAddress");
        await draft.load("shippingAddress");
        if (!draft.billingAddress) {
            throw new Exception("Billing address is required before submitting", {
                status: 422,
                code: "E_BILLING_REQUIRED",
            });
        }
        if (!draft.paymentGatewayIdSnapshot) {
            throw new Exception("Payment method is required before submitting", {
                status: 422,
                code: "E_PAYMENT_REQUIRED",
            });
        }
        const lines = await OrderLineItem.query().where("order_id", Number(draft.id));
        if (lines.length === 0) {
            throw new Exception("Order has no line items", {
                status: 422,
                code: "E_ORDER_EMPTY",
            });
        }

        await db.transaction(async (trx) => {
            draft.useTransaction(trx);

            /** Lock the order row so a parallel finalize on the same draft serializes here. */
            await trx.from("orders").where("id", Number(draft.id)).forUpdate().first();

            const { previous, current } = await this.factory.snapshotForFinalize(draft, trx, opts.locale ?? "fa");
            const drift = this.detectDrift(previous, current);
            if (drift) {
                throw new Exception("Product price changed since the draft was last viewed", {
                    status: 409,
                    code: "E_PRICE_CHANGED",
                    cause: drift as unknown as Error,
                });
            }

            draft.idempotencyKey = opts.idempotencyKey ?? draft.idempotencyKey ?? null;
            draft.orderKey = draft.orderKey ?? this.generateOrderKey();
            if (opts.ipAddress) draft.ipAddress = opts.ipAddress;
            if (opts.userAgent !== undefined) draft.userAgent = opts.userAgent;
            await draft.save();

            /**
             * Coupon redemption write happens AFTER the draft is persisted (so the FK to orders.id
             * resolves) and BEFORE the status transition (so a failed re-validation rolls back the
             * whole submit, not just the redemption attempt). The lock + recount inside this
             * transaction is the race-safe bit — concurrent submits serialise on the coupon row.
             */
            await this.writeRedemptionLedger(draft, trx);

            await orderStateMachine.transition(draft, OrderStatus.Pending, {
                actor: opts.actor ?? null,
                reason: "checkout.submit",
                trx,
            });
        });

        /** Source cart is now consumed — drop the row so the customer's next visit starts fresh. */
        await CartItem.query().where("cart_id", Number(cart.id)).delete();
        cart.shippingZoneMethodId = null;
        await cart.save();

        await draft.refresh();
        await draft.load("paymentGateway");

        return {
            order: draft,
            payment: {
                gateway: {
                    id: draft.paymentGatewayIdSnapshot === null ? null : Number(draft.paymentGatewayIdSnapshot),
                    code: draft.paymentMethodCodeSnapshot ?? null,
                },
                /**
                 * Always `null` at finalize-time — the payment-intent URL is produced later by
                 * `POST /payment/init/:orderKey`, which calls into the resolved gateway adapter.
                 */
                redirectUrl: null,
            },
        };
    }

    /**
     * Snapshot an address from the customer's address book onto the order. When the address is in
     * Iran and the customer carries fiscal identifiers, also writes the matching
     * `order_address_iran_extensions` row so the order keeps a self-contained legal-identifier
     * record independent of any later profile edits.
     */
    async snapshotAddress(
        order: Order,
        source: CustomerAddress,
        kind: "billing" | "shipping",
        opts: {
            // biome-ignore lint/suspicious/noExplicitAny: Lucid trx type ergonomics — same workaround as admin/orders_controller.ts#writeAddress.
            trx?: typeof db.transaction extends never ? never : any;
            iranExtension?: Partial<OrderAddressIranExtension> | null;
        } = {},
    ): Promise<OrderAddress> {
        const trx = opts.trx ?? null;
        const row = new OrderAddress();
        if (trx) row.useTransaction(trx);
        row.orderId = order.id;
        row.kind = kind;
        row.firstName = source.firstName;
        row.lastName = source.lastName;
        row.company = source.company;
        row.addressLine1 = source.addressLine1;
        row.addressLine2 = source.addressLine2;
        row.city = source.city;
        row.regionId = source.regionId;
        row.regionText = source.regionText;
        row.postcode = source.postcode;
        row.country = source.country;
        row.phone = source.phone;
        await row.save();

        if (source.country === "IR" && order.customerId) {
            const profile = trx
                ? await CustomerIranProfile.query({ client: trx }).where("customer_id", Number(order.customerId)).first()
                : await CustomerIranProfile.find(Number(order.customerId));
            const extensionPayload = opts.iranExtension ?? null;
            const hasProfile = profile && (profile.nationalId || profile.corporateNationalId || profile.economicCode);
            if (hasProfile || (extensionPayload && Object.values(extensionPayload).some((v) => v))) {
                const ext = new OrderAddressIranExtension();
                if (trx) ext.useTransaction(trx);
                ext.orderAddressId = row.id;
                ext.nationalId = extensionPayload?.nationalId ?? profile?.nationalId ?? null;
                ext.corporateNationalId = extensionPayload?.corporateNationalId ?? profile?.corporateNationalId ?? null;
                ext.economicCode = extensionPayload?.economicCode ?? profile?.economicCode ?? null;
                ext.legalCompanyNameFa = extensionPayload?.legalCompanyNameFa ?? profile?.legalCompanyNameFa ?? null;
                ext.attributes = {};
                await ext.save();
            }
        }
        return row;
    }

    /**
     * Compare two snapshot sets keyed by (product, variation, quantity). Returns the first drift
     * detected so the caller can include both old + new prices in the 409 response; null when
     * everything matches.
     */
    private detectDrift(
        previous: Array<{ productId: number; variationId: number | null; priceSnapshot: number }>,
        current: Array<{ productId: number; variationId: number | null; priceSnapshot: number }>,
    ): { product_id: number; variation_id: number | null; old: number; new: number } | null {
        for (const cur of current) {
            const prev = previous.find((p) => p.productId === cur.productId && p.variationId === cur.variationId);
            if (!prev) continue;
            if (prev.priceSnapshot !== cur.priceSnapshot) {
                return {
                    product_id: cur.productId,
                    variation_id: cur.variationId,
                    old: prev.priceSnapshot,
                    new: cur.priceSnapshot,
                };
            }
        }
        return null;
    }

    /**
     * For each coupon line on the draft, lock the coupon row, re-validate the limits, and INSERT
     * the redemption row. UNIQUE `(coupon_id, order_id)` makes the INSERT idempotent under
     * `Idempotency-Key` replay — a retry of the same order returns the existing row instead of
     * double-counting. Limit re-validation throws E_COUPON_LIMIT_EXHAUSTED on race loss; the
     * surrounding transaction rolls back so no half-finalized order survives.
     */
    private async writeRedemptionLedger(order: Order, trx: TransactionClientContract): Promise<void> {
        const lines = await OrderCouponLine.query({ client: trx }).where("order_id", Number(order.id));
        if (lines.length === 0) return;

        const customerId = order.customerId === null || order.customerId === undefined ? null : Number(order.customerId);
        const email = order.billingEmail ?? null;

        for (const line of lines) {
            if (line.couponId === null || line.couponId === undefined) continue;
            const couponId = Number(line.couponId);
            const snapshot = await loadSnapshotForUpdate(couponId, trx);
            if (!snapshot) {
                /** Coupon was hard-deleted between draft and submit; treat as exhausted. */
                throw new Exception(`Coupon ${line.codeSnapshot} is no longer available`, {
                    status: 409,
                    code: "E_COUPON_LIMIT_EXHAUSTED",
                });
            }

            const globalCount = snapshot.usageLimitGlobal === null ? 0 : await countRedemptions(couponId, { client: trx });
            const perUserCount =
                snapshot.usageLimitPerUser === null ? 0 : await countRedemptions(couponId, { client: trx, customerId, email });

            /** Eligibility re-runs without item state — we only re-check the limit gates here. */
            const result = checkEligibility({
                coupon: snapshot,
                items: [
                    {
                        lineKey: "1",
                        productId: 0,
                        variationId: null,
                        quantity: 1,
                        priceSnapshot: 0,
                        lineSubtotal: 0,
                        categoryIds: [],
                        tagIds: [],
                    },
                ],
                itemsTotal: Number(order.itemsTotal),
                otherAppliedCouponIds: [],
                customer: { customerId, email },
                globalRedemptionCount: globalCount,
                perUserRedemptionCount: perUserCount,
            });
            if (
                !result.ok &&
                (result.reason === "usage_limit_global_reached" || result.reason === "usage_limit_per_user_reached")
            ) {
                throw new Exception(`Coupon ${line.codeSnapshot} limit reached`, {
                    status: 409,
                    code: "E_COUPON_LIMIT_EXHAUSTED",
                });
            }

            /**
             * Idempotency-safe: UNIQUE (coupon_id, order_id) means the second insert during a
             * replay fails. We swallow the duplicate-key error so the replay returns the same
             * order without surfacing a 500.
             */
            const existing = await CouponRedemption.query({ client: trx })
                .where("coupon_id", couponId)
                .where("order_id", Number(order.id))
                .first();
            if (existing) continue;

            await CouponRedemption.create(
                {
                    couponId: snapshot.id,
                    orderId: order.id,
                    customerId,
                    emailSnapshot: email ?? "",
                },
                { client: trx },
            );
        }
    }

    /**
     * Opaque 32-char hex key. Used in the guest pay-link URL. 20 bytes = 160 bits of entropy,
     * encoded to a 40-char hex string — sliced to 32 chars to match the `order_key` column width.
     */
    private generateOrderKey(): string {
        return randomBytes(ORDER_KEY_BYTES).toString("hex").slice(0, 32);
    }
}

export const orderFinalizer = new OrderFinalizer();
