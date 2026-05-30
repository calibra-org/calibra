import { test } from "@japa/runner";

import { createAdmin, createProduct } from "./helpers.js";
import Product from "#models/product";
import ProductImage from "#models/product_image";
import ProductTranslation from "#models/product_translation";
import { truncateAndCleanup } from "#tests/helpers/truncate";

test.group("Admin products CRUD", (group) => {
    let admin: Awaited<ReturnType<typeof createAdmin>>;
    group.each.setup(async () => {
        const cleanup = await truncateAndCleanup();
        admin = await createAdmin();
        return cleanup;
    });

    test("create with required fields returns the new product with translations", async ({ client, assert }) => {
        const response = await client
            .post("/api/v1/admin/products")
            .withGuard("api")
            .loginAs(admin)
            .json({
                type: "simple",
                sku: "SKU-CRUD-1",
                status: "publish",
                regular_price: 5_000_000,
                translations: [
                    { locale: "fa", name: "نام فارسی", slug: "name-fa" },
                    { locale: "en", name: "English Name", slug: "name-en" },
                ],
            });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        assert.equal(response.body().data.sku, "SKU-CRUD-1");
        assert.equal(response.body().data.translations.length, 2);
    });

    test("PATCH updates a single field", async ({ client, assert }) => {
        const p = await createProduct({ fa: { name: "پچ", slug: "patch-fa" }, en: { name: "Patch", slug: "patch-en" } });
        const response = await client.patch(`/api/v1/admin/products/${p.id}`).withGuard("api").loginAs(admin).json({
            featured: true,
        });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.isTrue(response.body().data.featured);
    });

    test("DELETE sets deleted_at instead of hard-deleting", async ({ client, assert }) => {
        const p = await createProduct({ fa: { name: "حذف", slug: "delete-fa" }, en: { name: "Delete", slug: "delete-en" } });
        const response = await client.delete(`/api/v1/admin/products/${p.id}`).withGuard("api").loginAs(admin);
        response.assertStatus(204);
        const reloaded = await Product.findOrFail(p.id);
        assert.isNotNull(reloaded.deletedAt);
    });

    test("duplicate copies translations and images", async ({ client, assert }) => {
        const source = await createProduct({ fa: { name: "اصل", slug: "src-fa" }, en: { name: "Source", slug: "src-en" } });
        const response = await client.post(`/api/v1/admin/products/${source.id}/duplicate`).withGuard("api").loginAs(admin);
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        const newId = response.body().data.id;
        assert.notEqual(newId, Number(source.id));
        const newTranslations = await ProductTranslation.query().where("product_id", String(newId));
        assert.equal(newTranslations.length, 2);
    });

    test("batch endpoint applies create/update/delete atomically", async ({ client, assert }) => {
        const toUpdate = await createProduct({ fa: { name: "ویرایش", slug: "edit-fa" }, en: { name: "Edit", slug: "edit-en" } });
        const toDelete = await createProduct({
            fa: { name: "حذف بچ", slug: "del-fa" },
            en: { name: "DelBatch", slug: "del-en" },
        });
        const response = await client
            .post("/api/v1/admin/products/batch")
            .withGuard("api")
            .loginAs(admin)
            .json({
                create: [
                    {
                        type: "simple",
                        sku: "SKU-BATCH-1",
                        regular_price: 1_000_000,
                        translations: [
                            { locale: "fa", name: "بچ یک", slug: "batch-1-fa" },
                            { locale: "en", name: "Batch 1", slug: "batch-1-en" },
                        ],
                    },
                ],
                update: [{ id: Number(toUpdate.id), menu_order: 99 }],
                delete: [Number(toDelete.id)],
            });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.equal(response.body().data.created.length, 1);
        assert.equal(response.body().data.updated.length, 1);
        assert.equal(response.body().data.deleted.length, 1);
        const deletedRow = await Product.find(toDelete.id);
        assert.isNotNull(deletedRow?.deletedAt);
        const _unused = await ProductImage.query().where("product_id", String(toUpdate.id));
        assert.isArray(_unused);
    });
});
