import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import PaymentGateway from "#models/payment_gateway";
import { orderStateMachine } from "#services/order_state_machine";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

test.group("POST /api/v1/checkout/orders/:order_key/pay", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("failed order with valid order_key re-reserves stock and returns payment intent", async ({ client, assert }) => {
        const gateway = await PaymentGateway.findBy("code", "cod");
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
            gatewayId: Number(gateway!.id),
        });
        draft.orderKey = "k".repeat(32);
        await draft.save();
        await orderStateMachine.transition(draft, OrderStatus.Pending);
        await orderStateMachine.transition(draft, OrderStatus.Failed);

        const response = await client
            .post(`/api/v1/checkout/orders/${draft.orderKey}/pay`)
            .json({ payment_gateway_id: Number(gateway!.id) });

        response.assertStatus(200);
        await draft.refresh();
        /**
         * cod is a no-redirect gateway; the pay-link path now invokes `payment_service.init`
         * which flips pending → on_hold inline.
         */
        assert.equal(draft.status, OrderStatus.OnHold);
    });

    test("wrong order_key returns 404", async ({ client }) => {
        const response = await client
            .post("/api/v1/checkout/orders/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/pay")
            .json({ payment_gateway_id: 6 });
        response.assertStatus(404);
    });

    test("completed order returns 409", async ({ client }) => {
        const gateway = await PaymentGateway.findBy("code", "cod");
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
            gatewayId: Number(gateway!.id),
        });
        draft.orderKey = "c".repeat(32);
        await draft.save();
        await orderStateMachine.transition(draft, OrderStatus.Pending);
        await orderStateMachine.transition(draft, OrderStatus.Processing);
        await orderStateMachine.transition(draft, OrderStatus.Completed);

        const response = await client
            .post(`/api/v1/checkout/orders/${draft.orderKey}/pay`)
            .json({ payment_gateway_id: Number(gateway!.id) });
        response.assertStatus(409);
    });
});
