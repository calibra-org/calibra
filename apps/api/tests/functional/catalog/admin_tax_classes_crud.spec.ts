import { test } from "@japa/runner";

import { createAdmin } from "./helpers.js";
import TaxClass from "#models/tax_class";
import { truncateAndCleanup } from "#tests/helpers/truncate";

test.group("Admin tax-classes CRUD", (group) => {
    let admin: Awaited<ReturnType<typeof createAdmin>>;
    group.each.setup(async () => {
        const cleanup = await truncateAndCleanup();
        admin = await createAdmin();
        return cleanup;
    });

    test("index lists every tax class", async ({ client, assert }) => {
        await TaxClass.createMany([
            { slug: "standard", name: "Standard rate" },
            { slug: "reduced", name: "Reduced rate" },
        ]);
        const response = await client.get("/api/v1/admin/tax-classes").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const slugs = response.body().data.map((row: { slug: string }) => row.slug);
        assert.includeMembers(slugs, ["standard", "reduced"]);
    });

    test("store creates a tax class", async ({ client, assert }) => {
        const response = await client
            .post("/api/v1/admin/tax-classes")
            .withGuard("api")
            .loginAs(admin)
            .json({ slug: "zero", name: "Zero-rated" });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        const created = await TaxClass.findBy("slug", "zero");
        assert.exists(created);
        assert.equal(created?.name, "Zero-rated");
    });

    test("store rejects duplicate slug with 409", async ({ client }) => {
        await TaxClass.create({ slug: "standard", name: "Standard rate" });
        const response = await client
            .post("/api/v1/admin/tax-classes")
            .withGuard("api")
            .loginAs(admin)
            .json({ slug: "standard", name: "Other" });
        response.assertStatus(409);
    });

    test("update mutates name + slug", async ({ client, assert }) => {
        const row = await TaxClass.create({ slug: "to-edit", name: "Initial" });
        const response = await client
            .patch(`/api/v1/admin/tax-classes/${row.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "Updated" });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const reloaded = await TaxClass.findOrFail(row.id);
        assert.equal(reloaded.name, "Updated");
    });

    test("delete removes the row", async ({ client, assert }) => {
        const row = await TaxClass.create({ slug: "to-drop", name: "Drop" });
        const response = await client.delete(`/api/v1/admin/tax-classes/${row.id}`).withGuard("api").loginAs(admin);
        response.assertStatus(204);
        const reloaded = await TaxClass.find(row.id);
        assert.isNull(reloaded);
    });

    test("show returns 404 when missing", async ({ client }) => {
        const response = await client.get("/api/v1/admin/tax-classes/999999").withGuard("api").loginAs(admin);
        response.assertStatus(404);
    });
});
