import { test } from "@japa/runner";

import ProductExport from "#models/product_export";
import ProductExportFilterPreset from "#models/product_export_filter_preset";
import User from "#models/user";
import { createExportAdmin, seedTestProducts, truncateExportTables } from "#tests/helpers/product_exports";

async function createCustomer(email: string): Promise<User> {
    return User.create({ email, passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
}

test.group("/api/v1/admin/products/export — auth", (group) => {
    group.each.setup(async () => {
        await truncateExportTables();
    });

    test("non-admin user gets 403 on count", async ({ client }) => {
        const customer = await createCustomer("nope-exp@calibra.dev");
        const response = await client.get("/api/v1/admin/products/export/count").withGuard("api").loginAs(customer);
        response.assertStatus(403);
    });

    test("unauthenticated request to start is rejected", async ({ client }) => {
        const response = await client.post("/api/v1/admin/products/export/start");
        response.assertStatus(401);
    });
});

test.group("/api/v1/admin/products/export — count", (group) => {
    group.each.setup(async () => {
        await truncateExportTables();
        await seedTestProducts();
    });

    test("unfiltered count returns every product", async ({ client, assert }) => {
        const admin = await createExportAdmin();
        const response = await client.get("/api/v1/admin/products/export/count").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        const body = response.body() as { data: { products: number; variations: number; total_rows: number } };
        assert.equal(body.data.products, 3);
        assert.equal(body.data.total_rows, 3);
    });

    test("status filter narrows the count", async ({ client, assert }) => {
        const admin = await createExportAdmin();
        const response = await client
            .get("/api/v1/admin/products/export/count")
            .qs({ "status[]": "publish" })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        const body = response.body() as { data: { products: number } };
        assert.equal(body.data.products, 2);
    });

    test("type filter + featured combine via AND", async ({ client, assert }) => {
        const admin = await createExportAdmin();
        const response = await client
            .get("/api/v1/admin/products/export/count")
            .qs({ "type[]": "simple", featured: "true" })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        const body = response.body() as { data: { products: number } };
        assert.equal(body.data.products, 1, "only test-export-a is simple AND featured");
    });

    test("sku_pattern glob translates * → %", async ({ client, assert }) => {
        const admin = await createExportAdmin();
        const response = await client
            .get("/api/v1/admin/products/export/count")
            .qs({ sku_pattern: "test-export-*" })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        const body = response.body() as { data: { products: number } };
        assert.equal(body.data.products, 3);
    });
});

test.group("/api/v1/admin/products/export — start + lifecycle", (group) => {
    group.each.setup(async () => {
        await truncateExportTables();
        await seedTestProducts();
    });

    test("start kicks off the runner and reaches completed", async ({ client, assert }) => {
        const admin = await createExportAdmin();
        const start = await client
            .post("/api/v1/admin/products/export/start")
            .withGuard("api")
            .loginAs(admin)
            .json({ columns: ["sku", "name", "regular_price"], status: ["publish"] });
        start.assertStatus(202);
        const id = (start.body() as { data: { id: number } }).data.id;

        await waitForCompletion(id);
        const fresh = await ProductExport.findOrFail(id);
        assert.equal(fresh.status, "completed");
        assert.equal(fresh.processedRows, 2);
        assert.isAtLeast(Number(fresh.fileSizeBytes), 1);
        assert.isNotNull(fresh.downloadTokenHash);
    });

    test("cancel endpoint sets the cancellation flag", async ({ client, assert }) => {
        const admin = await createExportAdmin();
        const start = await client
            .post("/api/v1/admin/products/export/start")
            .withGuard("api")
            .loginAs(admin)
            .json({ columns: ["sku"], status: ["publish"] });
        const id = (start.body() as { data: { id: number } }).data.id;

        const cancel = await client.post(`/api/v1/admin/products/export/${id}/cancel`).withGuard("api").loginAs(admin);
        cancel.assertStatus(200);
        const fresh = await ProductExport.findOrFail(id);
        assert.isNotNull(fresh.cancellationRequestedAt);
    });

    test("history list returns user's own exports only", async ({ client, assert }) => {
        const admin = await createExportAdmin();
        const other = await createExportAdmin("export-admin-2@calibra.dev");

        const a = await client
            .post("/api/v1/admin/products/export/start")
            .withGuard("api")
            .loginAs(admin)
            .json({ columns: ["sku"] });
        const otherStart = await client
            .post("/api/v1/admin/products/export/start")
            .withGuard("api")
            .loginAs(other)
            .json({ columns: ["sku"] });

        const list = await client.get("/api/v1/admin/products/export/history").withGuard("api").loginAs(admin);
        list.assertStatus(200);
        const body = list.body() as { data: Array<{ id: number; user_id: number }> };
        assert.isAtLeast(body.data.length, 1);
        for (const row of body.data) assert.equal(row.user_id, Number(admin.id));
        const ids = body.data.map((r) => r.id);
        assert.include(ids, (a.body() as { data: { id: number } }).data.id);
        assert.notInclude(ids, (otherStart.body() as { data: { id: number } }).data.id);
    });
});

test.group("/api/v1/admin/products/export — download signed URL", (group) => {
    group.each.setup(async () => {
        await truncateExportTables();
        await seedTestProducts();
    });

    test("download with wrong token returns 403", async ({ client }) => {
        const admin = await createExportAdmin();
        const start = await client
            .post("/api/v1/admin/products/export/start")
            .withGuard("api")
            .loginAs(admin)
            .json({ columns: ["sku"], status: ["publish"] });
        const id = (start.body() as { data: { id: number } }).data.id;
        await waitForCompletion(id);

        const response = await client
            .get(`/api/v1/admin/products/export/${id}/download`)
            .qs({ token: "forged.token" })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(403);
    });

    /**
     * Regression test for the seconds-vs-milliseconds TTL bug. The signed-URL helper passed
     * `Math.floor((expiresAt - now) / 1000)` to `messageVerifier.sign`'s `expiresIn` arg, but
     * Adonis interprets a numeric `expiresIn` as MILLISECONDS — so a 24h window collapsed to
     * ~86 seconds. The download endpoint failed minutes after the export completed. We
     * verify two things here: (1) the happy path returns 200 with a real CSV body, and (2)
     * the token's embedded `expiryDate` actually sits in the long future, not seconds away.
     */
    test("download with freshly minted token returns the CSV — TTL well in the future", async ({ client, assert }) => {
        const admin = await createExportAdmin();
        const start = await client
            .post("/api/v1/admin/products/export/start")
            .withGuard("api")
            .loginAs(admin)
            .json({ columns: ["sku"], status: ["publish"] });
        const id = (start.body() as { data: { id: number } }).data.id;
        await waitForCompletion(id);

        const show = await client.get(`/api/v1/admin/products/export/${id}`).withGuard("api").loginAs(admin);
        show.assertStatus(200);
        const token = (show.body() as { download_token: string | null }).download_token;
        assert.isString(token);
        assert.isAbove(token!.length, 0);

        /**
         * Decode the verifier's payload (base64url first segment, no signature check —
         * that's the api's job at /download). The embedded `expiryDate` must be far
         * enough in the future that an operator clicking download within ~1 hour still
         * works. The bug had this expiry at "now + ~86s".
         */
        const [encoded] = token!.split(".");
        const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
        const payload = JSON.parse(Buffer.from(padded, "base64url").toString("utf8")) as {
            message: { userId: number; exportId: number };
            purpose: string;
            expiryDate: string;
        };
        assert.equal(payload.purpose, "export_download");
        assert.equal(payload.message.exportId, id);
        const ttlMs = new Date(payload.expiryDate).getTime() - Date.now();
        assert.isAbove(
            ttlMs,
            60 * 60 * 1000,
            `download token TTL ${ttlMs}ms is < 1h — likely the seconds-vs-ms regression returned`,
        );

        const download = await client
            .get(`/api/v1/admin/products/export/${id}/download`)
            .qs({ token: token! })
            .withGuard("api")
            .loginAs(admin);
        download.assertStatus(200);
        assert.match(download.headers()["content-type"] ?? "", /text\/csv/);
        assert.include(download.text(), "sku");
    });
});

test.group("/api/v1/admin/products/export — presets CRUD", (group) => {
    group.each.setup(async () => {
        await truncateExportTables();
    });

    test("create + list + delete round-trip", async ({ client, assert }) => {
        const admin = await createExportAdmin();
        const created = await client
            .post("/api/v1/admin/products/export/presets")
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "Catalog brands", filters: { type: ["simple"] }, columns: ["sku", "name"] });
        created.assertStatus(201);
        const id = (created.body() as { data: { id: number } }).data.id;

        const list = await client.get("/api/v1/admin/products/export/presets").withGuard("api").loginAs(admin);
        list.assertStatus(200);
        const items = (list.body() as { data: Array<{ id: number; name: string }> }).data;
        assert.equal(items.length, 1);
        assert.equal(items[0]!.name, "Catalog brands");

        const del = await client.delete(`/api/v1/admin/products/export/presets/${id}`).withGuard("api").loginAs(admin);
        del.assertStatus(204);
        const fresh = await ProductExportFilterPreset.find(id);
        assert.isNull(fresh);
    });
});

async function waitForCompletion(exportId: number, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const row = await ProductExport.find(exportId);
        if (row !== null && (row.status === "completed" || row.status === "failed" || row.status === "cancelled")) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`export ${exportId} did not complete in ${timeoutMs}ms`);
}
