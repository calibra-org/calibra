import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { CustomerFactory } from "#factories/customer_factory";
import Cart from "#models/cart";
import CartItem from "#models/cart_item";
import OrderLineItem from "#models/order_line_item";
import OrderShippingLine from "#models/order_shipping_line";
import { orderFactory } from "#services/order_factory";
import { createTaxableProduct } from "#tests/helpers/cart";
import { iranRegionId, resetPhase05, seedCustomerCartReadyToCheckout } from "#tests/helpers/orders";

test.group("OrderFactory.fromCart", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("empty cart throws E_CART_EMPTY", async ({ assert }) => {
        const cart = await Cart.create({ currency: "IRR", country: "IR" });
        await assert.rejects(() => orderFactory.fromCart(cart), /empty cart/);
    });

    test("snapshots every cart line as an order_line_items row", async ({ assert }) => {
        const customer = await CustomerFactory.create();
        const productA = await createTaxableProduct({ regularPrice: 1_000_000 });
        const productB = await createTaxableProduct({ regularPrice: 2_500_000 });
        const cart = await Cart.create({
            customerId: customer.id,
            currency: "IRR",
            country: "IR",
            regionId: await iranRegionId(),
        });
        await CartItem.create({
            cartId: cart.id,
            productId: productA.id,
            variationId: null,
            quantity: 2,
            priceSnapshot: 1_000_000,
            attributesSnapshot: {},
        });
        await CartItem.create({
            cartId: cart.id,
            productId: productB.id,
            variationId: null,
            quantity: 1,
            priceSnapshot: 2_500_000,
            attributesSnapshot: {},
        });

        const order = await orderFactory.fromCart(cart);
        assert.equal(order.status, OrderStatus.Draft);

        const lines = await OrderLineItem.query().where("order_id", Number(order.id)).orderBy("id", "asc");
        assert.equal(lines.length, 2);
        assert.equal(Number(lines[0].priceSnapshot), 1_000_000);
        assert.equal(lines[0].quantity, 2);
        assert.equal(Number(lines[1].priceSnapshot), 2_500_000);
        assert.equal(lines[1].quantity, 1);
    });

    test("selected shipping rate is persisted as order_shipping_lines", async ({ assert }) => {
        const customer = await CustomerFactory.create();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const cart = await seedCustomerCartReadyToCheckout(customer, product, 1);

        const order = await orderFactory.fromCart(cart);

        const shipping = await OrderShippingLine.query().where("order_id", Number(order.id)).first();
        assert.isNotNull(shipping);
        assert.equal(shipping!.methodCodeSnapshot, "free_shipping");
    });

    test("totals on the order match the cart math", async ({ assert }) => {
        const customer = await CustomerFactory.create();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const cart = await seedCustomerCartReadyToCheckout(customer, product, 3);

        const order = await orderFactory.fromCart(cart);
        await order.refresh();

        /** prices_include_tax=true, 10% VAT, 3 × 1M Rial = 3M gross. */
        assert.equal(Number(order.itemsTotal), 2_727_273);
        assert.equal(Number(order.itemsTaxTotal), 272_727);
        assert.equal(Number(order.shippingTotal), 0);
    });
});
