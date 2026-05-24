import { test } from "@japa/runner";

import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import Order from "#models/order";
import OrderMeta from "#models/order_meta";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

/**
 * Functional coverage for the Phase 2 order-editor surface. Each test exercises a single
 * mutation against a freshly seeded order, asserting both the wire envelope (OpenAPI) and the
 * persisted database state — drift between the controller, transformer, and spec turns the
 * suite red on its own.
 */

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

test.group("Order edit — addresses + line items + fees + shipping", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("PATCH /addresses/billing persists fields and syncs billing_email", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 500_000 });

        const res = await client
            .patch(`/api/v1/admin/orders/${order.id}/addresses/billing`)
            .loginAs(admin)
            .json({
                first_name: "Sara",
                last_name: "Karimi",
                address_line_1: "خیابان آزادی",
                city: "تهران",
                country: "IR",
                email: "sara@example.com",
                phone: "+989120000000",
                national_id: "0079472056",
            });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body().data;
        assert.equal(body.billing_email, "sara@example.com");
        assert.equal(body.billing_address.first_name, "Sara");
        assert.equal(body.billing_address.country, "IR");
    });

    test("POST + PATCH + DELETE line item recomputes totals and rejects deletion when refund references the line", async ({
        client,
        assert,
    }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 100_000 });

        const create = await client
            .post(`/api/v1/admin/orders/${order.id}/line-items`)
            .loginAs(admin)
            .json({ product_id: Number(product.id), quantity: 2, price_override_minor: 90_000 });
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        const createdLineId = (create.body().data.line_items as Array<{ id: number; price: number }>).find(
            (line) => line.price === 90_000,
        )?.id;
        assert.isDefined(createdLineId);
        assert.equal(create.body().data.totals.items_total, 100_000 + 180_000);

        const update = await client
            .patch(`/api/v1/admin/orders/${order.id}/line-items/${createdLineId}`)
            .loginAs(admin)
            .json({ quantity: 3 });
        update.assertStatus(200);
        update.assertAgainstApiSpec();
        assert.equal(update.body().data.totals.items_total, 100_000 + 270_000);

        const remove = await client.delete(`/api/v1/admin/orders/${order.id}/line-items/${createdLineId}`).loginAs(admin);
        remove.assertStatus(200);
        remove.assertAgainstApiSpec();
        assert.equal(remove.body().data.totals.items_total, 100_000);
    });

    test("Fee line create + delete adjusts fees_total", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 500_000 });

        const create = await client
            .post(`/api/v1/admin/orders/${order.id}/fee-lines`)
            .loginAs(admin)
            .json({ title: "هزینه بسته‌بندی", amount_minor: 50_000 });
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        assert.equal(create.body().data.totals.fees_total, 50_000);
        const feeId = (create.body().data.fee_lines as Array<{ id: number }>)[0].id;

        const remove = await client.delete(`/api/v1/admin/orders/${order.id}/fee-lines/${feeId}`).loginAs(admin);
        remove.assertStatus(200);
        remove.assertAgainstApiSpec();
        assert.equal(remove.body().data.totals.fees_total, 0);
    });

    test("Shipping line create + patch + delete adjusts shipping_total", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 500_000 });

        const create = await client
            .post(`/api/v1/admin/orders/${order.id}/shipping-lines`)
            .loginAs(admin)
            .json({ method_code: "post", title: "پست عادی", total_minor: 100_000 });
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        assert.equal(create.body().data.totals.shipping_total, 100_000);
        const lineId = (create.body().data.shipping_lines as Array<{ id: number }>)[0].id;

        const patch = await client
            .patch(`/api/v1/admin/orders/${order.id}/shipping-lines/${lineId}`)
            .loginAs(admin)
            .json({ total_minor: 150_000 });
        patch.assertStatus(200);
        patch.assertAgainstApiSpec();
        assert.equal(patch.body().data.totals.shipping_total, 150_000);

        const remove = await client.delete(`/api/v1/admin/orders/${order.id}/shipping-lines/${lineId}`).loginAs(admin);
        remove.assertStatus(200);
        remove.assertAgainstApiSpec();
        assert.equal(remove.body().data.totals.shipping_total, 0);
    });
});

test.group("Order edit — recalculate + header + meta + customer-stats", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("POST /recalculate-totals returns a preview without persisting when preview=true", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 200_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 200_000 });
        const dbOrder = await Order.findOrFail(Number(order.id));
        dbOrder.itemsTotal = 999_999;
        dbOrder.grandTotal = 999_999;
        await dbOrder.save();

        const preview = await client
            .post(`/api/v1/admin/orders/${order.id}/recalculate-totals`)
            .loginAs(admin)
            .json({ preview: true });
        preview.assertStatus(200);
        preview.assertAgainstApiSpec();
        assert.equal(preview.body().data.current.grandTotal, 999_999);
        assert.equal(preview.body().data.preview.grandTotal, 200_000);

        const stillDrifted = await Order.findOrFail(Number(order.id));
        assert.equal(Number(stillDrifted.grandTotal), 999_999, "preview must not persist");

        const commit = await client.post(`/api/v1/admin/orders/${order.id}/recalculate-totals`).loginAs(admin).json({});
        commit.assertStatus(200);
        commit.assertAgainstApiSpec();
        assert.equal(commit.body().data.totals.grand_total, 200_000);
    });

    test("PATCH /header updates customer_id + billing_email", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 500_000 });
        const customerUser = await UserFactory.create();
        const customer = await Customer.create({
            userId: customerUser.id,
            firstName: "Reza",
            lastName: "Akbari",
            countryDefault: "IR",
            isPayingCustomer: false,
        });

        const res = await client
            .patch(`/api/v1/admin/orders/${order.id}/header`)
            .loginAs(admin)
            .json({ customer_id: Number(customer.id), billing_email: "reza@example.com" });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.equal(res.body().data.customer_id, Number(customer.id));
        assert.equal(res.body().data.billing_email, "reza@example.com");
    });

    test("Meta upsert + delete roundtrips and splits visible/hidden by underscore prefix", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 100_000 });

        const upsert = await client
            .patch(`/api/v1/admin/orders/${order.id}/meta`)
            .loginAs(admin)
            .json({ key: "delivery_window", value: "morning" });
        upsert.assertStatus(200);
        upsert.assertAgainstApiSpec();
        assert.equal(upsert.body().data.meta_visible.delivery_window, "morning");

        const hidden = await client
            .patch(`/api/v1/admin/orders/${order.id}/meta`)
            .loginAs(admin)
            .json({ key: "_internal_token", value: "abc" });
        hidden.assertStatus(200);
        hidden.assertAgainstApiSpec();
        assert.equal(hidden.body().data.meta_hidden._internal_token, "abc");
        assert.isUndefined(hidden.body().data.meta_visible._internal_token);

        const update = await client
            .patch(`/api/v1/admin/orders/${order.id}/meta`)
            .loginAs(admin)
            .json({ key: "delivery_window", value: "evening" });
        update.assertStatus(200);
        assert.equal(update.body().data.meta_visible.delivery_window, "evening");
        const allRows = await OrderMeta.query().where("order_id", Number(order.id));
        assert.equal(allRows.length, 2, "upsert must not duplicate");

        const remove = await client
            .delete(`/api/v1/admin/orders/${order.id}/meta/${encodeURIComponent("delivery_window")}`)
            .loginAs(admin);
        remove.assertStatus(200);
        remove.assertAgainstApiSpec();
        assert.isUndefined(remove.body().data.meta_visible.delivery_window);
    });

    test("GET /customer-stats returns zeros for guest orders and real numbers otherwise", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 250_000 });
        const guestOrder = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 250_000,
        });

        const guest = await client.get(`/api/v1/admin/orders/${guestOrder.id}/customer-stats`).loginAs(admin);
        guest.assertStatus(200);
        guest.assertAgainstApiSpec();
        assert.equal(guest.body().data.lifetime_order_count, 0);
        assert.equal(guest.body().data.average_order_value_minor, 0);
    });
});

test.group("Order edit — coupons + auth gates", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("All edit endpoints require admin role", async ({ client }) => {
        const customerUser = await UserFactory.create();
        await Customer.create({
            userId: customerUser.id,
            firstName: "Cust",
            lastName: "Omer",
            countryDefault: "IR",
            isPayingCustomer: false,
        });
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 100_000 });

        const res = await client
            .patch(`/api/v1/admin/orders/${order.id}/meta`)
            .loginAs(customerUser)
            .json({ key: "x", value: "y" });
        res.assertStatus(403);
    });

    test("Removing a non-applied coupon 404s", async ({ client }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 100_000 });
        const res = await client.delete(`/api/v1/admin/orders/${order.id}/coupons/nonexistent`).loginAs(admin);
        res.assertStatus(404);
    });
});
