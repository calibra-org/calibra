import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import TaxClass from "#models/tax_class";

test.group("Admin tax-classes CRUD", (group) => {
    group.each.setup(async () => testUtils.db().truncate());

    test("index lists every tax class", async ({ client, assert }) => {
        await TaxClass.createMany([
            { slug: "standard", name: "Standard rate" },
            { slug: "reduced", name: "Reduced rate" },
        ]);
        const response = await client.get("/api/v1/admin/tax-classes");
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const slugs = response.body().data.map((row: { slug: string }) => row.slug);
        assert.includeMembers(slugs, ["standard", "reduced"]);
    });

    test("store creates a tax class", async ({ client, assert }) => {
        const response = await client.post("/api/v1/admin/tax-classes").json({ slug: "zero", name: "Zero-rated" });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        const created = await TaxClass.findBy("slug", "zero");
        assert.exists(created);
        assert.equal(created?.name, "Zero-rated");
    });

    test("store rejects duplicate slug with 409", async ({ client }) => {
        await TaxClass.create({ slug: "standard", name: "Standard rate" });
        const response = await client.post("/api/v1/admin/tax-classes").json({ slug: "standard", name: "Other" });
        response.assertStatus(409);
    });

    test("update mutates name + slug", async ({ client, assert }) => {
        const row = await TaxClass.create({ slug: "to-edit", name: "Initial" });
        const response = await client.patch(`/api/v1/admin/tax-classes/${row.id}`).json({ name: "Updated" });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const reloaded = await TaxClass.findOrFail(row.id);
        assert.equal(reloaded.name, "Updated");
    });

    test("delete removes the row", async ({ client, assert }) => {
        const row = await TaxClass.create({ slug: "to-drop", name: "Drop" });
        const response = await client.delete(`/api/v1/admin/tax-classes/${row.id}`);
        response.assertStatus(204);
        const reloaded = await TaxClass.find(row.id);
        assert.isNull(reloaded);
    });

    test("show returns 404 when missing", async ({ client }) => {
        const response = await client.get("/api/v1/admin/tax-classes/999999");
        response.assertStatus(404);
    });
});
