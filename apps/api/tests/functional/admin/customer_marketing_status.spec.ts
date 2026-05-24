import { test } from "@japa/runner";

import AdminAuditLog from "#models/admin_audit_log";
import Customer from "#models/customer";
import CustomerMarketingConsentHistory from "#models/customer_marketing_consent_history";
import CustomerStatusHistory from "#models/customer_status_history";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

async function createAdmin() {
    const user = await User.create({
        email: "admin@calibra.dev",
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
    await Customer.create({
        userId: user.id,
        firstName: "Admin",
        lastName: "User",
        countryDefault: "IR",
        status: "active",
    });
    return user;
}

async function createCustomer() {
    return Customer.create({
        firstName: "Mark",
        lastName: "Target",
        countryDefault: "IR",
        status: "active",
    });
}

test.group("/api/v1/admin/customers/:id/marketing + status", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("marketing GET returns defaults when no prefs row exists", async ({ client }) => {
        const admin = await createAdmin();
        const customer = await createCustomer();
        const response = await client.get(`/api/v1/admin/customers/${customer.id}/marketing`).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as {
            data: { email_opt_in: boolean; sms_opt_in: boolean; phone_call_opt_in: boolean };
        };
        const { email_opt_in, sms_opt_in, phone_call_opt_in } = body.data;
        if (email_opt_in !== false || sms_opt_in !== false || phone_call_opt_in !== false) {
            throw new Error("Expected all opt-ins to default to false");
        }
    });

    test("marketing PATCH writes prefs + history + audit row", async ({ client, assert }) => {
        const admin = await createAdmin();
        const customer = await createCustomer();
        const response = await client
            .patch(`/api/v1/admin/customers/${customer.id}/marketing`)
            .withGuard("api")
            .loginAs(admin)
            .json({ channel: "email", opt_in: true, source: "support-call" });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { email_opt_in: boolean; email_opt_in_source: string } };
        assert.equal(body.data.email_opt_in, true);
        assert.equal(body.data.email_opt_in_source, "support-call");

        const history = await CustomerMarketingConsentHistory.query()
            .where("customer_id", Number(customer.id))
            .orderBy("occurred_at", "desc");
        assert.equal(history.length, 1);
        assert.equal(history[0].channel, "email");
        assert.equal(history[0].optedIn, true);

        const audit = await AdminAuditLog.query().where("entity_kind", "customer").where("action", "customer.marketing.patch");
        assert.equal(audit.length, 1);
    });

    test("settle-then-persist: same-value marketing PATCH is a no-op (no history, no audit)", async ({ client, assert }) => {
        /**
         * Backend half of the settle-then-persist pattern: an admin client that debounces a
         * toggle and lands back on the original value should NOT produce a history row or an
         * audit row. The reference frontend (`useSettleMutation`) collapses the redundant request
         * before it leaves the browser, but a second operator or an automated reconciler might
         * still send one — the backend has to be idempotent on its own.
         */
        const admin = await createAdmin();
        const customer = await createCustomer();

        const flipOn = await client
            .patch(`/api/v1/admin/customers/${customer.id}/marketing`)
            .withGuard("api")
            .loginAs(admin)
            .json({ channel: "email", opt_in: true });
        flipOn.assertStatus(200);

        const sameValue = await client
            .patch(`/api/v1/admin/customers/${customer.id}/marketing`)
            .withGuard("api")
            .loginAs(admin)
            .json({ channel: "email", opt_in: true });
        sameValue.assertStatus(200);

        const history = await CustomerMarketingConsentHistory.query()
            .where("customer_id", Number(customer.id))
            .where("channel", "email");
        assert.equal(history.length, 1, "second same-value PATCH must not write a history row");

        const audit = await AdminAuditLog.query().where("entity_kind", "customer").where("action", "customer.marketing.patch");
        assert.equal(audit.length, 1, "second same-value PATCH must not write an audit row");
    });

    test("status PATCH writes status_history + audit row", async ({ client, assert }) => {
        const admin = await createAdmin();
        const customer = await createCustomer();
        const response = await client
            .patch(`/api/v1/admin/customers/${customer.id}/status`)
            .withGuard("api")
            .loginAs(admin)
            .json({ status: "suspended", reason: "abuse" });
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const fresh = await Customer.find(customer.id);
        assert.equal(fresh?.status, "suspended");
        const history = await CustomerStatusHistory.query().where("customer_id", Number(customer.id));
        assert.equal(history.length, 1);
        assert.equal(history[0].fromStatus, "active");
        assert.equal(history[0].toStatus, "suspended");
        assert.equal(history[0].reason, "abuse");
        const audit = await AdminAuditLog.query().where("entity_kind", "customer").where("action", "customer.status.patch");
        assert.equal(audit.length, 1);
    });

    test("status PATCH same-status returns 200 no-op", async ({ client }) => {
        const admin = await createAdmin();
        const customer = await createCustomer();
        const response = await client
            .patch(`/api/v1/admin/customers/${customer.id}/status`)
            .withGuard("api")
            .loginAs(admin)
            .json({ status: "active" });
        response.assertStatus(200);
    });
});
