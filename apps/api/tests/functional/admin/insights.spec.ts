import { test } from "@japa/runner";

import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import { resetPhase05 } from "#tests/helpers/orders";

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

async function plainUser() {
    const user = await UserFactory.create();
    await Customer.create({
        userId: user.id,
        firstName: "Plain",
        lastName: "User",
        countryDefault: "IR",
        isPayingCustomer: true,
    });
    return user;
}

test.group("GET /api/v1/admin/insights/customers", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("rejects unauthenticated requests with 401", async ({ client }) => {
        const response = await client.get("/api/v1/admin/insights/customers");
        response.assertStatus(401);
    });

    test("rejects non-admin sessions with 403", async ({ client }) => {
        const user = await plainUser();
        const response = await client.get("/api/v1/admin/insights/customers").withGuard("api").loginAs(user);
        response.assertStatus(403);
    });

    test("returns the full insights payload with 30-day sparklines", async ({ client, assert }) => {
        const admin = await adminUser();
        const response = await client.get("/api/v1/admin/insights/customers").withGuard("api").loginAs(admin);

        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as {
            data: {
                total: number;
                total_delta_30d: number;
                avg_order_count: number;
                avg_order_count_delta_30d: number;
                avg_lifetime_spend_minor: number;
                avg_lifetime_spend_delta_30d_pct: number;
                avg_order_value_minor: number;
                avg_order_value_delta_30d_pct: number;
                pct_with_account: number;
                sparklines: { total: number[]; spend_minor: number[] };
                generated_at: string;
            };
        };

        assert.isAtLeast(body.data.total, 1);
        assert.lengthOf(body.data.sparklines.total, 30);
        assert.lengthOf(body.data.sparklines.spend_minor, 30);
        assert.isAtLeast(body.data.pct_with_account, 0);
        assert.isAtMost(body.data.pct_with_account, 100);
        assert.match(body.data.generated_at, /^\d{4}-\d{2}-\d{2}T/);
    });
});
