import { test } from "@japa/runner";
import { DateTime } from "luxon";

import Cart from "#models/cart";
import Customer from "#models/customer";
import User from "#models/user";
import { createTaxableProduct, resetWithFoundation } from "#tests/helpers/cart";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") {
        throw new Error("expected cart_token cookie on response");
    }
    return cookie.value;
}

async function createCustomer(email: string) {
    const user = await User.create({
        email,
        passwordHash: "Passw0rd1!",
        role: "customer",
        locale: "fa",
    });
    const customer = await Customer.create({
        userId: user.id,
        firstName: "تست",
        lastName: "تستی",
        phone: "+989121234567",
        countryDefault: "IR",
    });
    return { user, customer };
}

test.group("cart lifecycle", (group) => {
    group.each.setup(async () => {
        await resetWithFoundation();
    });

    test("first GET /api/v1/cart creates a cart and sets the cart_token cookie", async ({ client, assert }) => {
        const response = await client.get("/api/v1/cart");
        response.assertStatus(200);
        response.assertCookie("cart_token");
        const body = response.body();
        assert.exists(body.data.id);
        assert.equal(body.data.items.length, 0);
        assert.equal(body.data.totals.grand_total, 0);
    });

    test("a second GET with the cart_token cookie returns the same cart", async ({ client, assert }) => {
        const first = await client.get("/api/v1/cart");
        const token = tokenFromResponse(first);

        const second = await client.get("/api/v1/cart").cookie("cart_token", token);
        second.assertStatus(200);
        assert.equal(second.body().data.id, first.body().data.id);
        assert.equal(second.body().data.token, first.body().data.token);
    });

    test("authenticated request creates a customer-linked cart on first hit", async ({ client, assert }) => {
        const { user, customer } = await createCustomer("auth-cart@calibra.dev");
        const response = await client.get("/api/v1/cart").withGuard("api").loginAs(user);
        response.assertStatus(200);
        assert.equal(response.body().data.customer_id, Number(customer.id));
        const stored = await Cart.query().where("customer_id", Number(customer.id)).first();
        assert.exists(stored);
    });

    test("logging in merges an anonymous cart into the customer cart by summing quantities", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const { user, customer } = await createCustomer("merge@calibra.dev");

        /** Step 1: while logged in, seed the customer cart with quantity 2. */
        const customerSeed = await client
            .post("/api/v1/cart/items")
            .withGuard("api")
            .loginAs(user)
            .json({ product_id: Number(product.id), quantity: 2 });
        customerSeed.assertStatus(200);

        /** Step 2: as an anonymous shopper, seed a cart with quantity 3 of the same product. */
        const anonSeed = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 3 });
        anonSeed.assertStatus(200);
        const anonToken = tokenFromResponse(anonSeed);

        /** Step 3: login while carrying the anonymous cart_token cookie — middleware should merge. */
        const merged = await client.get("/api/v1/cart").cookie("cart_token", anonToken).withGuard("api").loginAs(user);
        merged.assertStatus(200);
        const body = merged.body();
        assert.equal(body.data.customer_id, Number(customer.id));
        assert.equal(body.data.items.length, 1);
        assert.equal(body.data.items[0].quantity, 5);

        const remainingCarts = await Cart.query().count("id as total").first();
        assert.equal(Number(remainingCarts?.$extras.total ?? 0), 1);
    });

    test("cart:purge removes anonymous carts older than the configured cutoff", async ({ assert }) => {
        const stale = await Cart.create({ customerId: null, currency: "IRR" });
        stale.lastActivityAt = DateTime.utc().minus({ days: 35 });
        await stale.save();

        const fresh = await Cart.create({ customerId: null, currency: "IRR" });
        const beforeIds = await Cart.query().select("id");
        assert.equal(beforeIds.length, 2);

        const CartPurge = (await import("#commands/cart_purge")).default;
        const { default: ace } = await import("@adonisjs/core/services/ace");
        const command = await ace.create(CartPurge, []);
        await command.exec();
        command.assertSucceeded();

        const surviving = await Cart.query().select("id");
        assert.equal(surviving.length, 1);
        assert.equal(Number(surviving[0]!.id), Number(fresh.id));
    });
});
