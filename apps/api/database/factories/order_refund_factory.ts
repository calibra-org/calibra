import factory from "@adonisjs/lucid/factories";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import OrderRefund from "#models/order_refund";

let counter = 0;

/**
 * Bare {@link OrderRefund} factory. Tests that exercise the controller/service flow should call
 * `refund_service.create(...)` directly so the side effects (state machine, restock, audit note)
 * actually fire — this factory exists for unit tests that want to fixture a refund row in
 * isolation (e.g. seeding "prior refund" state for amount-validation specs).
 */
export const OrderRefundFactory = factory
    .define(OrderRefund, async () => {
        counter += 1;
        const next = (await db.rawQuery("SELECT nextval('refund_number_seq') as next")) as {
            rows?: Array<{ next: unknown }>;
        };
        return {
            orderId: 0 as unknown as bigint,
            refundNumber: Number(next.rows?.[0]?.next ?? counter),
            amountMinor: 1_000_000,
            taxAmountMinor: 0,
            reason: null,
            refundedByUserId: null,
            restockRequested: false,
            gatewayRefundId: null,
            idempotencyKey: null,
            processedAt: DateTime.utc(),
            attributes: {},
        };
    })
    .build();
