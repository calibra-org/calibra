import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";

async function createAdmin(email = "admin@taxonomy-inline-create.test") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "Admin", lastName: "User", countryDefault: "IR" });
    return user;
}

async function resetState() {
    await db.rawQuery(`TRUNCATE TABLE "product_category_translations" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_categories" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_tag_translations" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_tags" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_brand_translations" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_brands" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`);
}

test.group("admin taxonomy inline-create — minimal payload", (group) => {
    group.each.setup(async () => {
        await resetState();
    });

    test("POST /admin/categories accepts {translations:[{locale:'fa', name}]} and persists the row", async ({ client, assert }) => {
        const admin = await createAdmin();
        const create = await client
            .post("/api/v1/admin/categories")
            .json({ translations: [{ locale: "fa", name: "دستهٔ تازه" }] })
            .withGuard("api")
            .loginAs(admin);
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        const body = create.body() as { data: { id: number; name: string; parent_id: number | null } };
        assert.equal(body.data.name, "دستهٔ تازه");
        assert.equal(body.data.parent_id, null);
    });

    test("POST /admin/categories supports parent_id from the inline form", async ({ client, assert }) => {
        const admin = await createAdmin();
        const parent = await client
            .post("/api/v1/admin/categories")
            .json({ translations: [{ locale: "fa", name: "والد" }] })
            .withGuard("api")
            .loginAs(admin);
        const parentId = (parent.body() as { data: { id: number } }).data.id;

        const child = await client
            .post("/api/v1/admin/categories")
            .json({ parent_id: parentId, translations: [{ locale: "fa", name: "فرزند" }] })
            .withGuard("api")
            .loginAs(admin);
        child.assertStatus(201);
        child.assertAgainstApiSpec();
        const body = child.body() as { data: { parent_id: number | null } };
        assert.equal(body.data.parent_id, parentId);
    });

    test("POST /admin/tags accepts the minimal payload", async ({ client, assert }) => {
        const admin = await createAdmin();
        const create = await client
            .post("/api/v1/admin/tags")
            .json({ translations: [{ locale: "fa", name: "برچسب تازه" }] })
            .withGuard("api")
            .loginAs(admin);
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        const body = create.body() as { data: { id: number; name: string } };
        assert.equal(body.data.name, "برچسب تازه");
    });

    test("POST /admin/brands accepts the minimal payload", async ({ client, assert }) => {
        const admin = await createAdmin();
        const create = await client
            .post("/api/v1/admin/brands")
            .json({ translations: [{ locale: "fa", name: "برند تازه" }] })
            .withGuard("api")
            .loginAs(admin);
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        const body = create.body() as { data: { id: number; name: string } };
        assert.equal(body.data.name, "برند تازه");
    });

    test("rejects an empty translations array on all three resources", async ({ client }) => {
        const admin = await createAdmin();
        for (const resource of ["categories", "tags", "brands"]) {
            const res = await client.post(`/api/v1/admin/${resource}`).json({ translations: [] }).withGuard("api").loginAs(admin);
            res.assertStatus(422);
        }
    });
});
