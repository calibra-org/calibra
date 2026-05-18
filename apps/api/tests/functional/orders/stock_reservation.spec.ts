import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import InventoryItem from "#models/inventory_item";
import { orderStateMachine } from "#services/order_state_machine";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

test.group("stock_reservation under state machine", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("submit (draft → pending) decrements inventory", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const before = await InventoryItem.query().where("product_id", Number(product.id)).first();
        const draft = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 5,
            price: 1_000_000,
        });
        await orderStateMachine.transition(draft, OrderStatus.Pending);
        const after = await InventoryItem.query().where("product_id", Number(product.id)).first();
        assert.equal(after!.stockQuantity, before!.stockQuantity - 5);
    });

    test("cancel restores inventory", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 3,
            price: 1_000_000,
        });
        await orderStateMachine.transition(draft, OrderStatus.Pending);
        const reserved = await InventoryItem.query().where("product_id", Number(product.id)).first();
        await orderStateMachine.transition(draft, OrderStatus.Cancelled);
        const restored = await InventoryItem.query().where("product_id", Number(product.id)).first();
        assert.equal(restored!.stockQuantity, reserved!.stockQuantity + 3);
    });

    test("concurrent submits for the last unit: one succeeds, one fails", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await InventoryItem.query().where("product_id", Number(product.id)).update({ stock_quantity: 1 });

        const draftA = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        const draftB = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });

        const results = await Promise.allSettled([
            orderStateMachine.transition(draftA, OrderStatus.Pending),
            orderStateMachine.transition(draftB, OrderStatus.Pending),
        ]);

        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;
        assert.equal(succeeded, 1);
        assert.equal(failed, 1);

        const after = await InventoryItem.query().where("product_id", Number(product.id)).first();
        assert.equal(after!.stockQuantity, 0);
    });
});
