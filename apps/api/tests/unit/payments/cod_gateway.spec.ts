import { test } from "@japa/runner";

import PaymentAttempt from "#models/payment_attempt";
import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import PaymentGateway from "#models/payment_gateway";
import { codGateway } from "#services/adapters/cod_gateway";
import { paymentService } from "#services/payment_service";
import { fetchCalls, mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";
import { resetPhase08 } from "#tests/helpers/payments";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder } from "#tests/helpers/orders";
import { orderStateMachine } from "#services/order_state_machine";

test.group("CodGateway", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        mockFetch({});
    });
    group.each.teardown(() => {
        unmockFetch();
    });

    test("init does not HTTP-call anything", async ({ assert }) => {
        const result = await codGateway.init({
            order: { id: 1, orderNumber: 1, grandTotal: 100 } as never,
            attempt: new PaymentAttempt(),
            settings: {},
            return_url: "http://localhost/cb",
        });
        assert.isNull(result.redirect_url);
        assert.lengthOf(fetchCalls(), 0);
    });

    test("payment_service.init via cod transitions order to on_hold and marks attempt verified", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const cod = await PaymentGateway.findByOrFail("code", "cod");
        const order = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 1_000_000, gatewayId: Number(cod.id) });
        await orderStateMachine.transition(order, OrderStatus.Pending, { reason: "test" });

        const result = await paymentService.init(order, cod.id, null);
        assert.isNull(result.redirect_url);

        await order.refresh();
        assert.equal(order.status, OrderStatus.OnHold);

        const attempt = await PaymentAttempt.find(result.attempt.id);
        assert.equal(attempt!.status, PaymentAttemptStatus.Verified);
        assert.equal(attempt!.gatewayCodeSnapshot, "cod");
    });
});
