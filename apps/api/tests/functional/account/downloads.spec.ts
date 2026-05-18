import { test } from "@japa/runner";
import { DateTime } from "luxon";

import Customer from "#models/customer";
import CustomerDownload from "#models/customer_download";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

async function createCustomer(email: string) {
    const user = await User.create({
        email,
        passwordHash: "Passw0rd1!",
        role: "customer",
        locale: "fa",
    });
    const customer = await Customer.create({
        userId: user.id,
        firstName: "F",
        lastName: "L",
        countryDefault: "IR",
    });
    return { user, customer };
}

test.group("GET /api/v1/account/downloads", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("returns only the customer's own active entitlements", async ({ client, assert }) => {
        const { user, customer } = await createCustomer("dl@calibra.dev");
        const { customer: other } = await createCustomer("other-dl@calibra.dev");

        const active = await CustomerDownload.create({
            customerId: customer.id,
            productId: 100,
            grantedAt: DateTime.utc(),
            expiresAt: DateTime.utc().plus({ days: 30 }),
            downloadLimit: 5,
            downloadsUsed: 0,
        });
        await CustomerDownload.create({
            customerId: customer.id,
            productId: 101,
            grantedAt: DateTime.utc().minus({ days: 10 }),
            expiresAt: DateTime.utc().minus({ days: 1 }),
            downloadLimit: 5,
            downloadsUsed: 0,
        });
        await CustomerDownload.create({
            customerId: other.id,
            productId: 200,
            grantedAt: DateTime.utc(),
            expiresAt: DateTime.utc().plus({ days: 30 }),
            downloadLimit: 5,
            downloadsUsed: 0,
        });

        const response = await client.get("/api/v1/account/downloads").withGuard("api").loginAs(user);
        response.assertStatus(200);
        const data = response.body().data as Array<{ id: number; product_id: number }>;
        assert.lengthOf(data, 1);
        assert.equal(data[0].id, Number(active.id));
    });

    test("returns a stub signed URL for an owned download", async ({ client, assert }) => {
        const { user, customer } = await createCustomer("dl-url@calibra.dev");
        const grant = await CustomerDownload.create({
            customerId: customer.id,
            productId: 100,
            grantedAt: DateTime.utc(),
        });

        const response = await client.get(`/api/v1/account/downloads/${grant.id}/url`).withGuard("api").loginAs(user);
        response.assertStatus(200);
        const body = response.body();
        assert.match(body.data.url, /^https:\/\/downloads\.example\.invalid\/stub\//);
        assert.exists(body.data.expires_at);
    });
});
