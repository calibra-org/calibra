import { randomBytes } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import db from "@adonisjs/lucid/services/db";

import { OrderStatus } from "#enums/order_status";
import type Cart from "#models/cart";
import CartItem from "#models/cart_item";
import type CustomerAddress from "#models/customer_address";
import CustomerIranProfile from "#models/customer_iran_profile";
import type Order from "#models/order";
import OrderAddress from "#models/order_address";
import OrderAddressIranExtension from "#models/order_address_iran_extension";
import OrderLineItem from "#models/order_line_item";
import type User from "#models/user";
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
    /** Stub for phase 08 — the post-submit payment-intent URL once a gateway adapter is wired. */
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
                /** Phase 08 fills this from the adapter; null in this phase. */
                redirectUrl: null,
            },
        };
    }

    /**
     * Snapshot an address from the customer's address book onto the order. Optionally writes the
     * IR fiscal-identifier extension row (Pattern 3) when the source customer carries one.
     */
    async snapshotAddress(
        order: Order,
        source: CustomerAddress,
        kind: "billing" | "shipping",
        opts: {
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
     * Opaque 32-char hex key. Used in the guest pay-link URL. 20 bytes = 160 bits of entropy,
     * encoded to a 40-char hex string — sliced to 32 chars to match the `order_key` column width.
     */
    private generateOrderKey(): string {
        return randomBytes(ORDER_KEY_BYTES).toString("hex").slice(0, 32);
    }
}

export const orderFinalizer = new OrderFinalizer();
