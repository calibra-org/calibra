import { randomUUID } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import type { ApiClient } from "@japa/api-client";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import PaymentGateway from "#models/payment_gateway";
import User from "#models/user";
import SettingsService from "#services/settings_service";
import { createTaxableProduct } from "#tests/helpers/cart";
import { resetPhase08 } from "#tests/helpers/payments";

const FACTOR_URL = "/api/v1/admin/factor";

async function createAdmin(email = "factor-admin@calibra.dev") {
    const user = await User.create({ email, passwordHash: randomUUID(), role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "مدیر", lastName: "فاکتور", countryDefault: "IR", status: "active" });
    return user;
}

async function createShopper(email = "factor-shopper@calibra.dev") {
    const user = await User.create({ email, passwordHash: randomUUID(), role: "customer", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "مشتری", lastName: "آزمایشی", countryDefault: "IR", status: "active" });
    return user;
}

function documentPayload(overrides: Record<string, unknown> = {}) {
    return {
        type: "proforma",
        customer: {
            name: "شرکت نمونه",
            email: "buyer@example.com",
            phone: "09120000000",
            company: "شرکت نمونه",
            national_id: null,
        },
        lines: [
            {
                product_id: null,
                variation_id: null,
                sku: "K20-DEMO",
                name: "کالای نمونه",
                description: "ردیف آزمایشی فاکتور",
                quantity: 2,
                unit_price_minor: 500_000,
                discount_percent: 0,
            },
        ],
        order_discount_minor: 0,
        shipping_minor: 0,
        tax_percent: 0,
        round_to_minor: 1,
        customer_note: null,
        internal_note: null,
        due_at: null,
        expires_at: null,
        delivery_channel: "none",
        status: "draft",
        ...overrides,
    };
}

async function createDocument(client: ApiClient, admin: User, overrides: Record<string, unknown> = {}) {
    const response = await client
        .post(`${FACTOR_URL}/documents`)
        .withGuard("api")
        .loginAs(admin)
        .json(documentPayload(overrides));
    response.assertStatus(201);
    return response;
}

test.group("Calibra factor admin and public payment", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        await db.from("settings").where("group_key", "factor").delete();
        await new SettingsService().clearCache();
    });

    test("document list rejects unauthenticated requests", async ({ client }) => {
        const response = await client.get(`${FACTOR_URL}/documents`);
        response.assertStatus(401);
    });

    test("document list rejects non-admin sessions", async ({ client }) => {
        const shopper = await createShopper();
        const response = await client.get(`${FACTOR_URL}/documents`).withGuard("api").loginAs(shopper);
        response.assertStatus(403);
    });

    test("empty document list matches the OpenAPI contract", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client.get(`${FACTOR_URL}/documents`).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.deepEqual(response.body().data, []);
        assert.equal(response.body().meta.total, 0);
    });

    test("creates a draft document with a backing order and calculated totals", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await createDocument(client, admin);
        response.assertAgainstApiSpec();
        const document = response.body().data as Record<string, unknown>;
        assert.equal(document.type, "proforma");
        assert.equal(document.status, "draft");
        assert.equal(document.payable_minor, 1_000_000);
        assert.equal(document.reference, null);
        assert.isAbove(Number(document.order_id), 0);
    });

    test("creates an issued document and finds it by reference search", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const reference = String(created.body().data.reference);
        assert.match(reference, /^K20-/);

        const list = await client.get(`${FACTOR_URL}/documents`).qs({ q: reference }).withGuard("api").loginAs(admin);
        list.assertStatus(200);
        list.assertAgainstApiSpec();
        assert.equal(list.body().data.length, 1);
        assert.equal(list.body().data[0].reference, reference);
    });

    test("rejects invalid document money input", async ({ client }) => {
        const admin = await createAdmin();
        const response = await client
            .post(`${FACTOR_URL}/documents`)
            .withGuard("api")
            .loginAs(admin)
            .json(documentPayload({ lines: [{ name: "نامعتبر", quantity: 1, unit_price_minor: -1 }] }));
        response.assertStatus(422);
    });

    test("returns 404 for a missing document", async ({ client }) => {
        const admin = await createAdmin();
        const response = await client.get(`${FACTOR_URL}/documents/999999`).withGuard("api").loginAs(admin);
        response.assertStatus(404);
    });

    test("updates a mutable draft and recalculates its backing order", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin);
        const id = Number(created.body().data.id);
        const update = await client
            .patch(`${FACTOR_URL}/documents/${id}`)
            .withGuard("api")
            .loginAs(admin)
            .json(
                documentPayload({
                    shipping_minor: 50_000,
                    tax_percent: 10,
                    expected_version: Number(created.body().data.version),
                }),
            );
        update.assertStatus(200);
        update.assertAgainstApiSpec();
        assert.equal(update.body().data.shipping_minor, 50_000);
        assert.equal(update.body().data.tax_minor, 105_000);
        assert.equal(update.body().data.payable_minor, 1_155_000);
        assert.equal(update.body().data.version, 2);
    });

    test("transitions a draft to sent and allocates a stable reference", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin);
        const id = Number(created.body().data.id);
        const transition = await client
            .post(`${FACTOR_URL}/documents/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "sent", reason: "ready", expected_version: Number(created.body().data.version) });
        transition.assertStatus(200);
        transition.assertAgainstApiSpec();
        assert.equal(transition.body().data.status, "sent");
        assert.match(String(transition.body().data.reference), /^K20-/);
    });

    test("rejects an invalid direct draft-to-paid transition", async ({ client }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin);
        const id = Number(created.body().data.id);
        const response = await client
            .post(`${FACTOR_URL}/documents/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "paid", expected_version: Number(created.body().data.version) });
        response.assertStatus(409);
    });

    test("records partial and final manual payments without exceeding the balance", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const id = Number(created.body().data.id);

        const partial = await client
            .post(`${FACTOR_URL}/documents/${id}/manual-payment`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                amount_minor: 400_000,
                method: "bank_transfer",
                reference: "PART-1",
                expected_version: Number(created.body().data.version),
            });
        partial.assertStatus(201);
        partial.assertAgainstApiSpec();
        assert.equal(partial.body().data.status, "awaiting");
        assert.equal(partial.body().data.outstanding_minor, 600_000);

        const final = await client
            .post(`${FACTOR_URL}/documents/${id}/manual-payment`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                amount_minor: 600_000,
                method: "bank_transfer",
                reference: "PART-2",
                expected_version: Number(partial.body().data.version),
            });
        final.assertStatus(201);
        final.assertAgainstApiSpec();
        assert.equal(final.body().data.status, "paid");
        assert.equal(final.body().data.collected_minor, 1_000_000);
        assert.equal(final.body().data.outstanding_minor, 0);
    });

    test("rejects a manual overpayment", async ({ client }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const id = Number(created.body().data.id);
        const response = await client
            .post(`${FACTOR_URL}/documents/${id}/manual-payment`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                amount_minor: 1_000_001,
                method: "cash",
                expected_version: Number(created.body().data.version),
            });
        response.assertStatus(422);
    });

    test("requires a tracking reference and rejects duplicate manual-payment references", async ({ client }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const id = Number(created.body().data.id);

        const missingReference = await client
            .post(`${FACTOR_URL}/documents/${id}/manual-payment`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                amount_minor: 100_000,
                method: "bank_transfer",
                expected_version: Number(created.body().data.version),
            });
        missingReference.assertStatus(422);

        const recorded = await client
            .post(`${FACTOR_URL}/documents/${id}/manual-payment`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                amount_minor: 100_000,
                method: "bank_transfer",
                reference: "TRACK-100",
                expected_version: Number(created.body().data.version),
            });
        recorded.assertStatus(201);

        const duplicate = await client
            .post(`${FACTOR_URL}/documents/${id}/manual-payment`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                amount_minor: 100_000,
                method: "bank_transfer",
                reference: "track-100",
                expected_version: Number(recorded.body().data.version),
            });
        duplicate.assertStatus(409);
    });

    test("does not convert a cancelled proforma", async ({ client }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const id = Number(created.body().data.id);
        const cancelled = await client
            .post(`${FACTOR_URL}/documents/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "cancelled", expected_version: Number(created.body().data.version) });
        cancelled.assertStatus(200);

        const converted = await client
            .post(`${FACTOR_URL}/documents/${id}/convert`)
            .withGuard("api")
            .loginAs(admin)
            .json({ target_type: "invoice", expected_version: Number(cancelled.body().data.version) });
        converted.assertStatus(409);
    });

    test("converts a proforma to a linked invoice", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const sourceId = Number(created.body().data.id);
        const response = await client
            .post(`${FACTOR_URL}/documents/${sourceId}/convert`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                target_type: "invoice",
                expected_version: Number(created.body().data.version),
            });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        assert.equal(response.body().data.type, "invoice");
        assert.equal(response.body().data.parent_document_id, sourceId);
        assert.equal(response.body().data.status, "sent");
        assert.match(String(response.body().data.reference), /^K20-INV-/);
        assert.equal(response.body().data.order_id, created.body().data.order_id);

        const source = await client.get(`${FACTOR_URL}/documents/${sourceId}`).withGuard("api").loginAs(admin);
        source.assertStatus(200);
        assert.equal(source.body().data.status, "cancelled");
    });

    test("rejects an expiration timestamp in the past", async ({ client }) => {
        const admin = await createAdmin();
        const response = await client
            .post(`${FACTOR_URL}/documents`)
            .withGuard("api")
            .loginAs(admin)
            .json(documentPayload({ expires_at: "2020-01-01T00:00:00.000Z" }));
        response.assertStatus(422);
    });

    test("creates a public payment link and exposes its tenant-scoped payload", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const id = Number(created.body().data.id);
        const gateway = await PaymentGateway.findByOrFail("code", "cod");
        const link = await client
            .post(`${FACTOR_URL}/documents/${id}/payment-link`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                gateway_id: Number(gateway.id),
                expected_version: Number(created.body().data.version),
            });
        link.assertStatus(201);
        link.assertAgainstApiSpec();

        const code = String(link.body().data.code);
        const publicResponse = await client.get(`/api/v1/factor/pay/${code}`);
        publicResponse.assertStatus(200);
        publicResponse.assertAgainstApiSpec();
        assert.equal(publicResponse.body().data.code, code);
        assert.equal(publicResponse.body().data.outstanding_minor, 1_000_000);
        assert.equal(publicResponse.body().data.gateways.length, 1);
        assert.equal(publicResponse.body().data.gateways[0].id, Number(gateway.id));
        assert.deepEqual(Object.keys(publicResponse.body().data.customer).sort(), ["company", "name"]);
    });

    test("initializes an idempotent offline payment without falsely collecting money", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const id = Number(created.body().data.id);
        const gateway = await PaymentGateway.findByOrFail("code", "cod");
        const link = await client
            .post(`${FACTOR_URL}/documents/${id}/payment-link`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                gateway_id: Number(gateway.id),
                expected_version: Number(created.body().data.version),
            });
        const code = String(link.body().data.code);

        const initialized = await client
            .post(`/api/v1/factor/pay/${code}/init`)
            .header("Idempotency-Key", "factor-functional-payment-1")
            .json({ gateway_id: Number(gateway.id) });
        initialized.assertStatus(200);
        initialized.assertAgainstApiSpec();
        assert.equal(initialized.body().data.redirect_url, null);
        assert.isTrue(initialized.body().data.offline_pending);
        assert.equal(initialized.body().data.payment_status, "awaiting_reconciliation");

        const detail = await client.get(`${FACTOR_URL}/documents/${id}`).withGuard("api").loginAs(admin);
        detail.assertStatus(200);
        detail.assertAgainstApiSpec();
        assert.equal(detail.body().data.status, "awaiting");
        assert.equal(detail.body().data.collected_minor, 0);
        assert.equal(detail.body().data.payments.length, 0);

        const refreshedPublic = await client.get(`/api/v1/factor/pay/${code}`);
        refreshedPublic.assertStatus(200);
        refreshedPublic.assertAgainstApiSpec();
        assert.equal(refreshedPublic.body().data.status, "awaiting");
        assert.equal(refreshedPublic.body().data.link_status, "pending");

        const repeated = await client
            .post(`/api/v1/factor/pay/${code}/init`)
            .header("Idempotency-Key", "factor-functional-payment-1")
            .json({ gateway_id: Number(gateway.id) });
        repeated.assertStatus(200);
        repeated.assertAgainstApiSpec();
        assert.equal(repeated.body().data.attempt_id, initialized.body().data.attempt_id);
        assert.isTrue(repeated.body().data.offline_pending);
        assert.equal(repeated.body().data.payment_status, "awaiting_reconciliation");
    });

    test("requires a stable idempotency key for public payment initialization", async ({ client }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const gateway = await PaymentGateway.findByOrFail("code", "cod");
        const link = await client
            .post(`${FACTOR_URL}/documents/${Number(created.body().data.id)}/payment-link`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                gateway_id: Number(gateway.id),
                expected_version: Number(created.body().data.version),
            });
        const response = await client
            .post(`/api/v1/factor/pay/${String(link.body().data.code)}/init`)
            .json({ gateway_id: Number(gateway.id) });
        response.assertStatus(422);
    });

    test("public GET is read-only and does not mark the document viewed", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const gateway = await PaymentGateway.findByOrFail("code", "cod");
        const link = await client
            .post(`${FACTOR_URL}/documents/${Number(created.body().data.id)}/payment-link`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                gateway_id: Number(gateway.id),
                expected_version: Number(created.body().data.version),
            });
        const publicResponse = await client.get(`/api/v1/factor/pay/${String(link.body().data.code)}`);
        publicResponse.assertStatus(200);
        const detail = await client
            .get(`${FACTOR_URL}/documents/${Number(created.body().data.id)}`)
            .withGuard("api")
            .loginAs(admin);
        assert.equal(detail.body().data.status, "awaiting");
        assert.equal(detail.body().data.viewed_at, null);
    });

    test("rejects direct credit-note creation and stale document versions", async ({ client }) => {
        const admin = await createAdmin();
        const directCredit = await client
            .post(`${FACTOR_URL}/documents`)
            .withGuard("api")
            .loginAs(admin)
            .json(documentPayload({ type: "credit_note" }));
        directCredit.assertStatus(422);

        const created = await createDocument(client, admin);
        const stale = await client
            .patch(`${FACTOR_URL}/documents/${Number(created.body().data.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json(documentPayload({ expected_version: Number(created.body().data.version) + 99 }));
        stale.assertStatus(409);
    });

    test("issued documents reject direct financial edits", async ({ client }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const response = await client
            .patch(`${FACTOR_URL}/documents/${Number(created.body().data.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json(
                documentPayload({
                    status: "sent",
                    expected_version: Number(created.body().data.version),
                    shipping_minor: 1,
                }),
            );
        response.assertStatus(409);
    });

    test("prevents duplicate conversion of the same proforma", async ({ client }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const sourceId = Number(created.body().data.id);
        const first = await client
            .post(`${FACTOR_URL}/documents/${sourceId}/convert`)
            .withGuard("api")
            .loginAs(admin)
            .json({ target_type: "invoice", expected_version: Number(created.body().data.version) });
        first.assertStatus(201);
        const second = await client
            .post(`${FACTOR_URL}/documents/${sourceId}/convert`)
            .withGuard("api")
            .loginAs(admin)
            .json({ target_type: "invoice", expected_version: Number(created.body().data.version) + 1 });
        second.assertStatus(409);
    });

    test("summary and report endpoints match their OpenAPI contracts", async ({ client, assert }) => {
        const admin = await createAdmin();
        await createDocument(client, admin, { status: "sent" });

        const summary = await client.get(`${FACTOR_URL}/summary`).withGuard("api").loginAs(admin);
        summary.assertStatus(200);
        summary.assertAgainstApiSpec();
        assert.equal(summary.body().data.total_documents, 1);

        const reports = await client.get(`${FACTOR_URL}/reports`).withGuard("api").loginAs(admin);
        reports.assertStatus(200);
        reports.assertAgainstApiSpec();
        assert.isArray(reports.body().data.monthly);
        assert.isArray(reports.body().data.aging);
    });

    test("settings are tenant-scoped, validated, audited, and returned with defaults", async ({ client, assert }) => {
        const admin = await createAdmin();
        const initial = await client.get(`${FACTOR_URL}/settings`).withGuard("api").loginAs(admin);
        initial.assertStatus(200);
        initial.assertAgainstApiSpec();
        assert.equal(initial.body().data.reference_prefix, "K20");

        const updated = await client
            .patch(`${FACTOR_URL}/settings`)
            .withGuard("api")
            .loginAs(admin)
            .json({ reference_prefix: "K21", default_tax_percent: 10, default_delivery_channel: "email" });
        updated.assertStatus(200);
        updated.assertAgainstApiSpec();
        assert.equal(updated.body().data.reference_prefix, "K21");
        assert.equal(updated.body().data.default_tax_percent, 10);
    });

    test("resource search connects customers and catalog products to the factor editor", async ({ client, assert }) => {
        const admin = await createAdmin();
        await createShopper("resource-customer@calibra.dev");
        const product = await createTaxableProduct({ regularPrice: 2_500_000 });

        const customers = await client
            .get(`${FACTOR_URL}/resources`)
            .qs({ kind: "customers", q: "مشتری" })
            .withGuard("api")
            .loginAs(admin);
        customers.assertStatus(200);
        customers.assertAgainstApiSpec();
        assert.isAtLeast(customers.body().data.length, 1);

        const products = await client
            .get(`${FACTOR_URL}/resources`)
            .qs({ kind: "products", q: "محصول" })
            .withGuard("api")
            .loginAs(admin);
        products.assertStatus(200);
        products.assertAgainstApiSpec();
        assert.equal(products.body().data[0].id, Number(product.id));
    });

    test("payment-attempt list includes attempts created by factor payment flows", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await createDocument(client, admin, { status: "sent" });
        const id = Number(created.body().data.id);
        const gateway = await PaymentGateway.findByOrFail("code", "cod");
        const link = await client
            .post(`${FACTOR_URL}/documents/${id}/payment-link`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                gateway_id: Number(gateway.id),
                expected_version: Number(created.body().data.version),
            });
        await client
            .post(`/api/v1/factor/pay/${String(link.body().data.code)}/init`)
            .header("Idempotency-Key", "factor-functional-payment-attempt")
            .json({ gateway_id: Number(gateway.id) });

        const attempts = await client.get(`${FACTOR_URL}/payment-attempts`).withGuard("api").loginAs(admin);
        attempts.assertStatus(200);
        attempts.assertAgainstApiSpec();
        assert.equal(attempts.body().meta.total, 1);
        assert.equal(attempts.body().data[0].document_id, id);
        assert.equal(attempts.body().data[0].document_status, "awaiting");
        assert.equal(attempts.body().data[0].status, "verified");
    });

    test("unknown public payment codes return 404", async ({ client }) => {
        const response = await client.get("/api/v1/factor/pay/abcdefghijklmnopqrstuvwx");
        response.assertStatus(404);
    });
});
