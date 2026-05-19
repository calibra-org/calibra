import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import OrderRefundLineItem from "#models/order_refund_line_item";
import { refundService } from "#services/refund_service";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder } from "#tests/helpers/orders";
import { advanceOrderTo, resetWithPhase07 } from "#tests/helpers/refunds";

test.group("refund_service.create — partial refunds", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("refund 2 of 5 units leaves 3 outstanding on that line", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 5,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);
        const line = (await order.related("lineItems").query()).at(0)!;

        const refund = await refundService.create(order.id, {
            lineItems: [{ orderLineItemId: line.id, quantity: 2, refundAmountMinor: 2_000_000 }],
        });

        assert.equal(Number(refund.amountMinor), 2_000_000);
        const lines = await OrderRefundLineItem.query().where("refund_id", Number(refund.id));
        assert.equal(lines.length, 1);
        assert.equal(lines[0].quantity, 2);

        /** A second refund of 3 must succeed; a refund of 4 must 422. */
        const second = await refundService.create(order.id, {
            lineItems: [{ orderLineItemId: line.id, quantity: 3, refundAmountMinor: 3_000_000 }],
        });
        assert.equal(Number(second.amountMinor), 3_000_000);

        /**
         * Third attempt over-refunds the now-empty line. Whether the service rejects with 422
         * (line quantity exceeds remaining) or 409 (order already fully refunded) depends on
         * which guard fires first; both are correct "refunds-exhausted" rejections. Accepting
         * either keeps the test focused on the semantic outcome rather than the guard order.
         */
        let thrown: { status?: number } | null = null;
        try {
            await refundService.create(order.id, {
                lineItems: [{ orderLineItemId: line.id, quantity: 1, refundAmountMinor: 1_000_000 }],
            });
        } catch (e) {
            thrown = e as { status?: number };
        }
        assert.oneOf(thrown?.status, [422, 409]);
    });

    test("order stays in current status while outstanding > 0", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 4,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        await refundService.create(order.id, { amountMinor: 1_000_000 });
        await order.refresh();
        assert.equal(order.status, OrderStatus.Processing);
    });
});
