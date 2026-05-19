import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import OrderNote from "#models/order_note";
import OrderStatusHistory from "#models/order_status_history";
import { refundService } from "#services/refund_service";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder } from "#tests/helpers/orders";
import { advanceOrderTo, resetWithPhase07 } from "#tests/helpers/refunds";

test.group("refund_service.create — full refund", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("refund sum == grand_total transitions order to refunded", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 5,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);
        const grandTotal = Number(order.grandTotal);

        await refundService.create(order.id, { amountMinor: grandTotal });
        await order.refresh();

        assert.equal(order.status, OrderStatus.Refunded);

        const history = await OrderStatusHistory.query().where("order_id", Number(order.id)).orderBy("id", "asc");
        const last = history.at(-1)!;
        assert.equal(last.toStatus, OrderStatus.Refunded);
    });

    test("audit note is written with refund number + amount", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        const refund = await refundService.create(order.id, { amountMinor: 500_000, reason: "smoke" });

        const notes = await OrderNote.query().where("order_id", Number(order.id));
        const audit = notes.find((n) => n.attributes && (n.attributes as Record<string, unknown>).source === "refund_service");
        assert.exists(audit);
        assert.equal(audit?.visibility, "internal");
        assert.include(audit?.body ?? "", `Refund #${Number(refund.refundNumber)}`);
        assert.include(audit?.body ?? "", "500000");
        assert.include(audit?.body ?? "", "smoke");
    });

    test("two partials summing to grand_total transition order", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        await refundService.create(order.id, { amountMinor: 1_500_000 });
        await order.refresh();
        assert.equal(order.status, OrderStatus.Completed);

        await refundService.create(order.id, { amountMinor: 500_000 });
        await order.refresh();
        assert.equal(order.status, OrderStatus.Refunded);
    });
});
