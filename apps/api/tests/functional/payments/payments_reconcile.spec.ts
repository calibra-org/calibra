import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import Order from "#models/order";
import OrderLineItem from "#models/order_line_item";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import { createTaxableProduct } from "#tests/helpers/cart";
import { resetPhase08 } from "#tests/helpers/payments";

/**
 * Reconcile sweep operates on `payment_attempts` rows in `awaiting_callback` state. With every
 * redirect PSP currently stubbed, the only way to manufacture that state is to seed a
 * synthetic row directly — bypassing `paymentService.init`, which now refuses stub gateways.
 * Once a real PSP integration lands and flips its `implementation_status` to `"live"`, this
 * helper should be replaced with an end-to-end submit flow against that PSP.
 */
async function seedStrandedAttempt(opts: {
    productId: number;
    gatewayCode: string;
    authority: string;
    initiatedMinutesAgo: number;
    attemptStatus?: PaymentAttemptStatus;
    orderStatus?: OrderStatus;
}): Promise<{ order: Order; attempt: PaymentAttempt }> {
    const gateway = await PaymentGateway.findByOrFail("code", opts.gatewayCode);
    const order = await Order.create({
        orderNumber: Date.now() % 1_000_000_000,
        orderKey: `wc_${opts.authority}`.slice(0, 32),
        status: opts.orderStatus ?? OrderStatus.Pending,
        currency: "IRR",
        currencyDisplay: "IRT",
        pricesIncludeTax: true,
        createdVia: "checkout",
        paymentGatewayIdSnapshot: gateway.id,
        paymentMethodCodeSnapshot: gateway.code,
        paymentMethodTitleSnapshot: gateway.code,
        itemsTotal: 1_000_000,
        grandTotal: 1_000_000,
    });
    await OrderLineItem.create({
        orderId: order.id,
        productId: opts.productId,
        variationId: null,
        nameSnapshot: "Test product",
        skuSnapshot: "SKU",
        quantity: 1,
        priceSnapshot: 1_000_000,
        subtotal: 1_000_000,
        subtotalTax: 0,
        total: 1_000_000,
        totalTax: 0,
        taxClassIdSnapshot: null,
        attributesSnapshot: {},
    });
    const attempt = new PaymentAttempt();
    attempt.orderId = order.id;
    attempt.gatewayId = gateway.id;
    attempt.gatewayCodeSnapshot = gateway.code;
    attempt.amountMinor = Number(order.grandTotal);
    attempt.currency = order.currency;
    attempt.status = opts.attemptStatus ?? PaymentAttemptStatus.AwaitingCallback;
    attempt.gatewayAuthority = opts.authority;
    attempt.gatewayPayload = {};
    attempt.initiatedAt = DateTime.utc().minus({ minutes: opts.initiatedMinutesAgo });
    await attempt.save();
    order.lastPaymentAttemptId = attempt.id;
    await order.save();
    return { order, attempt };
}

test.group("payments:reconcile ace command", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    test("detects pending orders past the reconcile window and emits a count", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await seedStrandedAttempt({
            productId: Number(product.id),
            gatewayCode: "zarinpal",
            authority: "ARECONCILE000000000000000000001",
            initiatedMinutesAgo: 30,
        });

        const ace = await import("@adonisjs/core/services/ace");
        const command = await ace.default.exec("payments:reconcile", ["--window=15"]);
        assert.equal(command.exitCode, 0);
    });

    test("ignores orders inside the window + non-pending orders", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const fresh = await seedStrandedAttempt({
            productId: Number(product.id),
            gatewayCode: "zarinpal",
            authority: "AFRESH00000000000000000000000001",
            initiatedMinutesAgo: 1,
        });
        const completed = await seedStrandedAttempt({
            productId: Number(product.id),
            gatewayCode: "zarinpal",
            authority: "AOLDBUTCOMPLETED00000000000000001",
            initiatedMinutesAgo: 120,
            attemptStatus: PaymentAttemptStatus.Verified,
            orderStatus: OrderStatus.Processing,
        });

        const ace = await import("@adonisjs/core/services/ace");
        const command = await ace.default.exec("payments:reconcile", ["--window=15"]);
        assert.equal(command.exitCode, 0);

        const log = command.logger.getLogs().map((l) => l.message);
        const stranded = log.filter((m) => m.includes("stranded order="));
        assert.lengthOf(
            stranded,
            0,
            `fresh order ${fresh.order.id} + completed order ${completed.order.id} should not appear stranded`,
        );
    });

    test("dry-run skips Sentry + metric updates but still logs stranded entries", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        await seedStrandedAttempt({
            productId: Number(product.id),
            gatewayCode: "zarinpal",
            authority: "ADRY00000000000000000000000000001",
            initiatedMinutesAgo: 60,
        });

        const ace = await import("@adonisjs/core/services/ace");
        const command = await ace.default.exec("payments:reconcile", ["--window=15", "--dry-run"]);
        assert.equal(command.exitCode, 0);
    });
});
