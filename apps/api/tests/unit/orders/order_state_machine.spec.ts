import { test } from "@japa/runner";

import { ORDER_TRANSITIONS, OrderStatus } from "#enums/order_status";
import InventoryItem from "#models/inventory_item";
import OrderStatusHistory from "#models/order_status_history";
import { orderStateMachine } from "#services/order_state_machine";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

test.group("OrderStateMachine.transition", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("draft → pending reserves stock + writes audit row", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const beforeInv = await InventoryItem.query().where("product_id", Number(product.id)).first();
        assert.isNotNull(beforeInv);

        const order = await makeDraftOrder({
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });

        await orderStateMachine.transition(order, OrderStatus.Pending, { reason: "submit" });

        const afterInv = await InventoryItem.query().where("product_id", Number(product.id)).first();
        assert.equal(afterInv!.stockQuantity, beforeInv!.stockQuantity - 2);

        await order.refresh();
        assert.equal(order.status, OrderStatus.Pending);

        const audit = await OrderStatusHistory.query().where("order_id", Number(order.id)).orderBy("id", "desc").first();
        assert.isNotNull(audit);
        assert.equal(audit!.fromStatus, OrderStatus.Draft);
        assert.equal(audit!.toStatus, OrderStatus.Pending);
    });

    test("pending → cancelled restores stock", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({ productId: Number(product.id), quantity: 3, price: 1_000_000 });

        await orderStateMachine.transition(order, OrderStatus.Pending, { reason: "submit" });
        const reserved = await InventoryItem.query().where("product_id", Number(product.id)).first();

        await orderStateMachine.transition(order, OrderStatus.Cancelled, { reason: "customer cancelled" });

        const restored = await InventoryItem.query().where("product_id", Number(product.id)).first();
        assert.equal(restored!.stockQuantity, reserved!.stockQuantity + 3);
    });

    test("processing → completed stamps date_completed_at", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 1_000_000 });

        await orderStateMachine.transition(order, OrderStatus.Pending);
        await orderStateMachine.transition(order, OrderStatus.Processing);
        await orderStateMachine.transition(order, OrderStatus.Completed);

        await order.refresh();
        assert.equal(order.status, OrderStatus.Completed);
        assert.isNotNull(order.dateCompletedAt);
    });

    test("on_hold → processing stamps date_paid_at", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 1_000_000 });

        await orderStateMachine.transition(order, OrderStatus.Pending);
        await orderStateMachine.transition(order, OrderStatus.OnHold);
        await orderStateMachine.transition(order, OrderStatus.Processing);

        await order.refresh();
        assert.isNotNull(order.datePaidAt);
    });

    test("illegal transition draft → completed throws E_ILLEGAL_ORDER_TRANSITION", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 1_000_000 });

        await assert.rejects(() => orderStateMachine.transition(order, OrderStatus.Completed), /Illegal order status transition/);
    });

    test("every transition in the ORDER_TRANSITIONS table is canTransition-true", async ({ assert }) => {
        for (const row of ORDER_TRANSITIONS) {
            assert.isTrue(orderStateMachine.canTransition(row.from, row.to), `${row.from} → ${row.to} should be legal`);
        }
    });

    test("transitions outside the table are canTransition-false", async ({ assert }) => {
        assert.isFalse(orderStateMachine.canTransition(OrderStatus.Draft, OrderStatus.Refunded));
        assert.isFalse(orderStateMachine.canTransition(OrderStatus.Completed, OrderStatus.Pending));
        assert.isFalse(orderStateMachine.canTransition(OrderStatus.Cancelled, OrderStatus.Pending));
    });

    test("failed → pending re-reserves stock", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({ productId: Number(product.id), quantity: 2, price: 1_000_000 });
        await orderStateMachine.transition(order, OrderStatus.Pending);
        await orderStateMachine.transition(order, OrderStatus.Failed);
        const beforeRetry = await InventoryItem.query().where("product_id", Number(product.id)).first();

        await orderStateMachine.transition(order, OrderStatus.Pending, { reason: "retry" });

        const afterRetry = await InventoryItem.query().where("product_id", Number(product.id)).first();
        /** Failed leaves stock as-is; the retry transition decrements again per the doc table. */
        assert.equal(afterRetry!.stockQuantity, beforeRetry!.stockQuantity - 2);
    });
});
