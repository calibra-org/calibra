import { test } from "@japa/runner";

import Product from "#models/product";
import ProductImport from "#models/product_import";
import ProductImportError from "#models/product_import_error";
import User from "#models/user";
import { createImportAdmin, truncateImportTables, writeTempCsv } from "#tests/helpers/product_imports";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

const BASE_CSV = `sku,name,regular_price,sale_price,stock_quantity,categories
test-001,محصول اول,۲۹۹٬۰۰۰ تومان,۲۴۹٬۰۰۰,۱۰,کفش > روزانه
test-002,محصول دوم,1500000,,5,پوشاک
test-003,محصول سوم,abc,,3,
`;

const UPDATE_CSV = `sku,regular_price
test-001,500000
test-999-missing,200000
`;

async function createCustomer(email: string): Promise<User> {
    return User.create({ email, passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
}

async function uploadFile(client: import("@japa/api-client").ApiClient, admin: User, body: string, name = "import.csv") {
    const path = await writeTempCsv(name, body);
    return client.post("/api/v1/admin/products/import/upload").withGuard("api").loginAs(admin).file("file", path);
}

test.group("/api/v1/admin/products/import — auth", (group) => {
    group.each.setup(async () => {
        await truncateImportTables();
    });

    test("non-admin user cannot reach the template endpoint", async ({ client }) => {
        const customer = await createCustomer("nope@calibra.dev");
        const response = await client.get("/api/v1/admin/products/import/template").withGuard("api").loginAs(customer);
        response.assertStatus(403);
    });

    test("unauthenticated request to upload is rejected", async ({ client }) => {
        const response = await client.post("/api/v1/admin/products/import/upload");
        response.assertStatus(401);
    });

    test("a second admin cannot see another admin's import (Bouncer: 403)", async ({ client }) => {
        const owner = await createImportAdmin("owner-admin@calibra.dev");
        const intruder = await createImportAdmin("intruder-admin@calibra.dev");
        const upload = await uploadFile(client, owner, BASE_CSV, "owned.csv");
        upload.assertStatus(201);
        const importId = upload.body().data.id;

        const show = await client.get(`/api/v1/admin/products/import/${importId}`).withGuard("api").loginAs(intruder);
        show.assertStatus(403);
    });
});

test.group("/api/v1/admin/products/import — template", (group) => {
    group.each.setup(async () => {
        await truncateImportTables();
    });

    test("template endpoint returns a UTF-8 BOM CSV with example rows", async ({ client, assert }) => {
        const admin = await createImportAdmin();
        const response = await client.get("/api/v1/admin/products/import/template").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        const text = response.text();
        assert.isTrue(text.startsWith("﻿"), "template should begin with UTF-8 BOM");
        assert.include(text, "sku");
        assert.include(text, "regular_price");
        assert.include(text, "var-001");
    });
});

test.group("/api/v1/admin/products/import — upload", (group) => {
    group.each.setup(async () => {
        await truncateImportTables();
    });

    test("admin can upload a CSV and gets auto-mapping + samples back", async ({ client, assert }) => {
        const admin = await createImportAdmin();
        const response = await uploadFile(client, admin, BASE_CSV);
        response.assertStatus(201);
        const body = response.body() as {
            data: { id: number; total_rows: number; mapping: Record<string, string | null> };
            headers: string[];
            samples: Record<string, string[]>;
        };
        assert.equal(body.data.total_rows, 3);
        assert.equal(body.data.mapping["sku"], "sku");
        assert.equal(body.data.mapping["regular_price"], "regular_price");
        assert.deepEqual(body.headers, ["sku", "name", "regular_price", "sale_price", "stock_quantity", "categories"]);
        assert.isTrue(body.samples["sku"]!.length >= 3);
    });
});

test.group("/api/v1/admin/products/import — preview", (group) => {
    group.each.setup(async () => {
        await truncateImportTables();
    });

    test("preview returns counters + warnings + failure list", async ({ client, assert }) => {
        const admin = await createImportAdmin();
        const uploaded = await uploadFile(client, admin, BASE_CSV);
        const importId = (uploaded.body() as { data: { id: number } }).data.id;

        const preview = await client
            .post("/api/v1/admin/products/import/preview")
            .withGuard("api")
            .loginAs(admin)
            .json({
                import_id: importId,
                mapping: {
                    sku: "sku",
                    name: "name",
                    regular_price: "regular_price",
                    sale_price: "sale_price",
                    stock_quantity: "stock_quantity",
                    categories: "categories",
                },
                update_existing: false,
            });
        preview.assertStatus(200);
        const body = preview.body() as {
            data: {
                totals: { create: number; update: number; skip: number; fail: number; warnings: number };
                failures: Array<{ code: string; sku: string | null }>;
            };
        };
        assert.equal(body.data.totals.create, 2);
        assert.equal(body.data.totals.fail, 1);
        assert.isAtLeast(body.data.failures.length, 1);
        assert.equal(body.data.failures[0]!.code, "invalid_price");
    });
});

test.group("/api/v1/admin/products/import — start + run", (group) => {
    group.each.setup(async () => {
        await truncateImportTables();
    });

    test("running an import creates products and records counters", async ({ client, assert }) => {
        const admin = await createImportAdmin();
        const uploaded = await uploadFile(client, admin, BASE_CSV);
        const importId = (uploaded.body() as { data: { id: number } }).data.id;

        const start = await client
            .post("/api/v1/admin/products/import/start")
            .withGuard("api")
            .loginAs(admin)
            .json({
                import_id: importId,
                mapping: {
                    sku: "sku",
                    name: "name",
                    regular_price: "regular_price",
                    sale_price: "sale_price",
                    stock_quantity: "stock_quantity",
                    categories: "categories",
                },
                update_existing: false,
            });
        start.assertStatus(202);

        await waitForCompletion(importId);

        const finished = await ProductImport.findOrFail(importId);
        assert.oneOf(finished.status, ["completed", "completed_with_errors"]);
        assert.equal(finished.createdCount, 2);
        assert.equal(finished.failedCount, 1);

        const errors = await ProductImportError.query().where("import_id", importId);
        assert.isAtLeast(errors.length, 1);
        assert.equal(errors[0]!.code, "invalid_price");

        /** Every row the job wrote must carry the importing tenant's id (no tenant-less / leaked rows). */
        const created = await Product.query();
        assert.isAbove(created.length, 0);
        for (const product of created) {
            assert.equal(Number(product.tenantId), TEST_TENANT_ID);
        }
    });

    test("update_existing skips duplicate SKUs when disabled", async ({ client, assert }) => {
        const admin = await createImportAdmin();
        const first = await uploadFile(client, admin, BASE_CSV);
        const firstId = (first.body() as { data: { id: number } }).data.id;
        await client
            .post("/api/v1/admin/products/import/start")
            .withGuard("api")
            .loginAs(admin)
            .json({
                import_id: firstId,
                mapping: {
                    sku: "sku",
                    name: "name",
                    regular_price: "regular_price",
                    sale_price: "sale_price",
                    stock_quantity: "stock_quantity",
                    categories: "categories",
                },
                update_existing: false,
            });
        await waitForCompletion(firstId);

        const second = await uploadFile(client, admin, UPDATE_CSV, "update.csv");
        const secondId = (second.body() as { data: { id: number } }).data.id;
        await client
            .post("/api/v1/admin/products/import/start")
            .withGuard("api")
            .loginAs(admin)
            .json({
                import_id: secondId,
                mapping: { sku: "sku", regular_price: "regular_price" },
                update_existing: false,
            });
        await waitForCompletion(secondId);

        const finished = await ProductImport.findOrFail(secondId);
        assert.equal(finished.skippedCount, 1, "test-001 should be skipped (duplicate)");
        assert.equal(finished.createdCount, 1, "test-999-missing should be created");
    });

    test("update_existing=true updates the matching product", async ({ client, assert }) => {
        const admin = await createImportAdmin();
        const first = await uploadFile(client, admin, BASE_CSV);
        const firstId = (first.body() as { data: { id: number } }).data.id;
        await client
            .post("/api/v1/admin/products/import/start")
            .withGuard("api")
            .loginAs(admin)
            .json({
                import_id: firstId,
                mapping: {
                    sku: "sku",
                    name: "name",
                    regular_price: "regular_price",
                    sale_price: "sale_price",
                    stock_quantity: "stock_quantity",
                    categories: "categories",
                },
                update_existing: false,
            });
        await waitForCompletion(firstId);

        const second = await uploadFile(client, admin, UPDATE_CSV, "update.csv");
        const secondId = (second.body() as { data: { id: number } }).data.id;
        await client
            .post("/api/v1/admin/products/import/start")
            .withGuard("api")
            .loginAs(admin)
            .json({
                import_id: secondId,
                mapping: { sku: "sku", regular_price: "regular_price" },
                update_existing: true,
            });
        await waitForCompletion(secondId);

        const finished = await ProductImport.findOrFail(secondId);
        assert.equal(finished.updatedCount, 1, "test-001 should be updated");
        assert.equal(finished.createdCount, 1, "test-999-missing should be created");
    });
});

test.group("/api/v1/admin/products/import — cancel + history", (group) => {
    group.each.setup(async () => {
        await truncateImportTables();
    });

    test("cancel endpoint sets the cancellation flag", async ({ client, assert }) => {
        const admin = await createImportAdmin();
        const uploaded = await uploadFile(client, admin, BASE_CSV);
        const id = (uploaded.body() as { data: { id: number } }).data.id;

        const response = await client.post(`/api/v1/admin/products/import/${id}/cancel`).withGuard("api").loginAs(admin);
        response.assertStatus(200);

        const fresh = await ProductImport.findOrFail(id);
        assert.isNotNull(fresh.cancellationRequestedAt);
    });

    test("history list returns past imports", async ({ client, assert }) => {
        const admin = await createImportAdmin();
        const uploaded = await uploadFile(client, admin, BASE_CSV);
        const id = (uploaded.body() as { data: { id: number } }).data.id;

        const history = await client.get("/api/v1/admin/products/import/history").withGuard("api").loginAs(admin);
        history.assertStatus(200);
        const body = history.body() as { data: Array<{ id: number; original_filename: string }> };
        assert.isAtLeast(body.data.length, 1);
        assert.equal(body.data[0]!.id, id);
    });
});

async function waitForCompletion(importId: number, timeoutMs: number = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const row = await ProductImport.find(importId);
        if (
            row !== null &&
            (row.status === "completed" ||
                row.status === "completed_with_errors" ||
                row.status === "failed" ||
                row.status === "cancelled")
        ) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`import ${importId} did not complete in ${timeoutMs}ms`);
}
