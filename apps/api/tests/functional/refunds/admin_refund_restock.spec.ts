import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import InventoryItem from "#models/inventory_item";
import InventoryMovement from "#models/inventory_movement";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder } from "#tests/helpers/orders";
import { advanceOrderTo, resetWithPhase07 } from "#tests/helpers/refunds";

async function adminUser() {
    const admin = await UserFactory.apply("admin").create();
    await Customer.create({
        userId: admin.id,
        firstName: "Admin",
        lastName: "User",
        countryDefault: "IR",
        isPayingCustomer: false,
    });
    return admin;
}

test.group("POST /api/v1/admin/orders/:order_id/refunds (restock)", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("restock_requested=true increments inventory + writes a return movement", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);
        /** Stock after the pending-reservation = 100 − 2 = 98. */
        const itemBefore = await InventoryItem.query().where("product_id", Number(product.id)).firstOrFail();
        const before = itemBefore.stockQuantity;

        const line = (await order.related("lineItems").query()).at(0)!;
        const response = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({
                line_items: [{ order_line_item_id: Number(line.id), quantity: 1, refund_amount_minor: 1_000_000 }],
                restock_requested: true,
            });
        response.assertStatus(201);

        const itemAfter = await InventoryItem.query().where("product_id", Number(product.id)).firstOrFail();
        assert.equal(itemAfter.stockQuantity, before + 1);

        const movements = await InventoryMovement.query().where("inventory_item_id", Number(itemAfter.id)).orderBy("id", "desc");
        const top = movements.at(0)!;
        assert.equal(top.kind, "restock");
        assert.equal(top.refKind, "refund");
        assert.equal(top.quantityDelta, 1);
    });

    test("restock_requested=false leaves inventory untouched", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);
        const itemBefore = await InventoryItem.query().where("product_id", Number(product.id)).firstOrFail();
        const before = itemBefore.stockQuantity;

        const line = (await order.related("lineItems").query()).at(0)!;
        await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({
                line_items: [{ order_line_item_id: Number(line.id), quantity: 1, refund_amount_minor: 1_000_000 }],
                restock_requested: false,
            });

        const itemAfter = await InventoryItem.query().where("product_id", Number(product.id)).firstOrFail();
        assert.equal(itemAfter.stockQuantity, before);
    });

    test("restock_requested=true for an untracked product is a no-op", async ({ client }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        /** Flip manage_stock off on the inventory row. */
        const item = await InventoryItem.query().where("product_id", Number(product.id)).firstOrFail();
        item.manageStock = false;
        await item.save();

        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);
        const line = (await order.related("lineItems").query()).at(0)!;

        const response = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({
                line_items: [{ order_line_item_id: Number(line.id), quantity: 1, refund_amount_minor: 1_000_000 }],
                restock_requested: true,
            });
        response.assertStatus(201);
    });
});
