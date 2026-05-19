import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { refundService } from "#services/refund_service";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder } from "#tests/helpers/orders";
import { advanceOrderTo, resetWithPhase07 } from "#tests/helpers/refunds";

test.group("refund_service.create — amount validation", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("amount AND line_items both → 422", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        let thrown: { status?: number } | null = null;
        try {
            await refundService.create(order.id, {
                amountMinor: 1_000_000,
                lineItems: [{ orderLineItemId: 1, quantity: 1 }],
            });
        } catch (e) {
            thrown = e as { status?: number };
        }
        assert.equal(thrown?.status, 422);
    });

    test("neither amount nor line_items → 422", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        let thrown: { status?: number } | null = null;
        try {
            await refundService.create(order.id, {});
        } catch (e) {
            thrown = e as { status?: number };
        }
        assert.equal(thrown?.status, 422);
    });

    test("amount exceeds outstanding → 422", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        let thrown: { status?: number; code?: string } | null = null;
        try {
            await refundService.create(order.id, { amountMinor: 9_999_999 });
        } catch (e) {
            thrown = e as { status?: number; code?: string };
        }
        assert.equal(thrown?.status, 422);
        assert.equal(thrown?.code, "E_REFUND_EXCEEDS_OUTSTANDING");
    });

    test("line quantity exceeds outstanding → 422", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        const line = (await order.related("lineItems").query()).at(0)!;

        let thrown: { status?: number; code?: string } | null = null;
        try {
            await refundService.create(order.id, {
                lineItems: [{ orderLineItemId: line.id, quantity: 99, refundAmountMinor: 1_000_000 }],
            });
        } catch (e) {
            thrown = e as { status?: number; code?: string };
        }
        assert.equal(thrown?.status, 422);
        assert.equal(thrown?.code, "E_REFUND_LINE_QUANTITY_EXCEEDS");
    });

    test("negative amount → 422 (validator catches before service)", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        let thrown: { status?: number } | null = null;
        try {
            await refundService.create(order.id, { amountMinor: -1 });
        } catch (e) {
            thrown = e as { status?: number };
        }
        assert.equal(thrown?.status, 422);
    });
});
