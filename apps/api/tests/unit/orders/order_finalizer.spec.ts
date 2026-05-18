import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { CustomerFactory } from "#factories/customer_factory";
import InventoryItem from "#models/inventory_item";
import InventoryMovement from "#models/inventory_movement";
import Order from "#models/order";
import OrderAddress from "#models/order_address";
import PaymentGateway from "#models/payment_gateway";
import Product from "#models/product";
import { orderFactory } from "#services/order_factory";
import { orderFinalizer } from "#services/order_finalizer";
import { createTaxableProduct } from "#tests/helpers/cart";
import { iranRegionId, resetPhase05, seedCustomerCartReadyToCheckout } from "#tests/helpers/orders";

async function prepareDraft(quantity = 1) {
    const customer = await CustomerFactory.create();
    const product = await createTaxableProduct({ regularPrice: 1_000_000 });
    const cart = await seedCustomerCartReadyToCheckout(customer, product, quantity);
    const draft = await orderFactory.fromCart(cart);
    const gateway = await PaymentGateway.findBy("code", "cod");
    draft.paymentGatewayIdSnapshot = gateway!.id;
    draft.paymentMethodCodeSnapshot = "cod";
    await draft.save();
    await OrderAddress.create({
        orderId: draft.id,
        kind: "billing",
        firstName: customer.firstName,
        lastName: customer.lastName,
        addressLine1: "Test St 1",
        city: "Tehran",
        country: "IR",
        regionId: await iranRegionId(),
        postcode: "1234567890",
        attributes: {},
    });
    return { cart, draft, product, customer };
}

test.group("OrderFinalizer.finalize", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("happy path: draft → pending, stock reserved, order_key minted", async ({ assert }) => {
        const { cart, draft, product } = await prepareDraft(2);
        const beforeInv = await InventoryItem.query().where("product_id", Number(product.id)).first();

        const result = await orderFinalizer.finalize(cart, draft, { idempotencyKey: "k-1" });

        assert.equal(result.order.status, OrderStatus.Pending);
        assert.isNotNull(result.order.orderKey);
        assert.equal(result.order.idempotencyKey, "k-1");

        const afterInv = await InventoryItem.query().where("product_id", Number(product.id)).first();
        assert.equal(afterInv!.stockQuantity, beforeInv!.stockQuantity - 2);

        const movements = await InventoryMovement.query().where("ref_kind", "order").where("ref_id", Number(result.order.id));
        assert.equal(movements.length, 1);
        assert.equal(movements[0].kind, "reservation");

        const persisted = await Order.findOrFail(result.order.id);
        assert.equal(persisted.idempotencyKey, "k-1");
    });

    test("out-of-stock mid-finalize rolls back fully", async ({ assert }) => {
        const { cart, draft, product } = await prepareDraft(2);
        await InventoryItem.query().where("product_id", Number(product.id)).update({ stock_quantity: 1 });
        const beforeStatus = draft.status;

        await assert.rejects(() => orderFinalizer.finalize(cart, draft, { idempotencyKey: "k-x" }), /Insufficient/);

        const persisted = await Order.findOrFail(draft.id);
        assert.equal(persisted.status, beforeStatus);
        assert.isNull(persisted.idempotencyKey, "idempotency key must not be written on rollback");

        const inv = await InventoryItem.query().where("product_id", Number(product.id)).first();
        assert.equal(inv!.stockQuantity, 1, "stock must remain at the pre-finalize value");
    });

    test("price drift > 0 returns 409 E_PRICE_CHANGED and rolls back", async ({ assert }) => {
        const { cart, draft, product } = await prepareDraft(1);
        await Product.query().where("id", Number(product.id)).update({ regular_price: 1_500_000 });

        await assert.rejects(() => orderFinalizer.finalize(cart, draft, { idempotencyKey: "k-d" }), /price changed/i);

        const persisted = await Order.findOrFail(draft.id);
        assert.equal(persisted.status, OrderStatus.Draft);
    });

    test("missing billing address → 422 E_BILLING_REQUIRED", async ({ assert }) => {
        const customer = await CustomerFactory.create();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const cart = await seedCustomerCartReadyToCheckout(customer, product, 1);
        const draft = await orderFactory.fromCart(cart);
        const gateway = await PaymentGateway.findBy("code", "cod");
        draft.paymentGatewayIdSnapshot = gateway!.id;
        await draft.save();
        /** No billing address. */

        await assert.rejects(() => orderFinalizer.finalize(cart, draft), /Billing address/);
    });

    test("missing payment method → 422 E_PAYMENT_REQUIRED", async ({ assert }) => {
        const customer = await CustomerFactory.create();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const cart = await seedCustomerCartReadyToCheckout(customer, product, 1);
        const draft = await orderFactory.fromCart(cart);
        await OrderAddress.create({
            orderId: draft.id,
            kind: "billing",
            firstName: "A",
            lastName: "B",
            addressLine1: "1",
            city: "Tehran",
            country: "IR",
            regionId: await iranRegionId(),
            postcode: "1234567890",
            attributes: {},
        });
        /** No payment_gateway_id_snapshot. */

        await assert.rejects(() => orderFinalizer.finalize(cart, draft), /Payment method/);
    });
});
