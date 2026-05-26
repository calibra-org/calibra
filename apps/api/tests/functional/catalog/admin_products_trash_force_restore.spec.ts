import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import Product from "#models/product";

import { createProduct } from "./helpers.js";

/**
 * Coverage for the trash / restore / force-delete + counts + new index filter dimensions
 * shipped on the products-list-foundation branch.
 */
test.group("Admin products — trash, restore, force-delete, counts", (group) => {
    group.each.setup(async () => testUtils.db().truncate());

    test("DELETE soft-deletes the product (deleted_at is set)", async ({ client, assert }) => {
        const product = await createProduct({ fa: { name: "حذف" }, en: { name: "Trashy" } });
        const res = await client.delete(`/api/v1/admin/products/${product.id}`);
        res.assertStatus(204);
        const reloaded = await Product.query().where("id", Number(product.id)).first();
        assert.isNotNull(reloaded);
        assert.isNotNull(reloaded?.deletedAt);
    });

    test("only_trashed=1 narrows the list to soft-deleted rows", async ({ client, assert }) => {
        const live = await createProduct({ fa: { name: "زنده" }, en: { name: "Live" } });
        const trashed = await createProduct({ fa: { name: "زباله" }, en: { name: "Trash" } });
        trashed.deletedAt = DateTime.utc();
        await trashed.save();

        const onlyTrash = await client.get("/api/v1/admin/products?only_trashed=1");
        onlyTrash.assertStatus(200);
        assert.equal(onlyTrash.body().meta.total, 1);
        assert.equal(onlyTrash.body().data[0].id, Number(trashed.id));

        const liveOnly = await client.get("/api/v1/admin/products");
        liveOnly.assertStatus(200);
        assert.equal(liveOnly.body().meta.total, 1);
        assert.equal(liveOnly.body().data[0].id, Number(live.id));
    });

    test("POST /:id/restore un-trashes the product", async ({ client, assert }) => {
        const product = await createProduct({ fa: { name: "بازگشت" }, en: { name: "Restore me" } });
        product.deletedAt = DateTime.utc();
        await product.save();

        const res = await client.post(`/api/v1/admin/products/${product.id}/restore`);
        res.assertStatus(200);
        assert.isNull(res.body().data.deleted_at);

        const reloaded = await Product.query().where("id", Number(product.id)).first();
        assert.isNull(reloaded?.deletedAt);
    });

    test("POST /restore bulk-restores listed ids", async ({ client, assert }) => {
        const a = await createProduct({ fa: { name: "الف" }, en: { name: "A" } });
        const b = await createProduct({ fa: { name: "ب" }, en: { name: "B" } });
        a.deletedAt = DateTime.utc();
        await a.save();
        b.deletedAt = DateTime.utc();
        await b.save();

        const res = await client.post("/api/v1/admin/products/restore").json({ ids: [Number(a.id), Number(b.id)] });
        res.assertStatus(200);
        assert.deepEqual(res.body().data.restored.sort(), [Number(a.id), Number(b.id)].sort());

        const live = await Product.query().whereIn("id", [Number(a.id), Number(b.id)]).whereNull("deleted_at");
        assert.equal(live.length, 2);
    });

    test("DELETE ?force=1 hard-deletes when no active order references the product", async ({ client, assert }) => {
        const product = await createProduct({ fa: { name: "حذف کامل" }, en: { name: "Force kill" } });
        const id = Number(product.id);
        const res = await client.delete(`/api/v1/admin/products/${id}?force=1`);
        res.assertStatus(204);
        const stillThere = await Product.query().where("id", id).first();
        assert.isNull(stillThere ?? null);
    });

    test("GET /products/counts returns the full breakdown", async ({ client, assert }) => {
        await createProduct({ fa: { name: "منتشر" }, en: { name: "Published" }, status: "publish" });
        await createProduct({ fa: { name: "پیش" }, en: { name: "Drafty" }, status: "draft" });
        const trashed = await createProduct({ fa: { name: "زباله" }, en: { name: "Trashed" } });
        trashed.deletedAt = DateTime.utc();
        await trashed.save();

        const res = await client.get("/api/v1/admin/products/counts");
        res.assertStatus(200);
        const data = res.body().data;
        assert.equal(data.publish, 1);
        assert.equal(data.draft, 1);
        assert.equal(data.trash, 1);
        assert.equal(data.any, 2);
    });

    test("on_sale=1 honors the sale schedule window", async ({ client, assert }) => {
        const now = DateTime.utc();
        const onSale = await createProduct({
            fa: { name: "فروش" },
            en: { name: "On sale" },
            regularPrice: 1_000_000,
            salePrice: 500_000,
        });
        const noSale = await createProduct({ fa: { name: "بدون" }, en: { name: "Plain" }, regularPrice: 1_000_000 });
        onSale.saleStartsAt = now.minus({ days: 1 });
        onSale.saleEndsAt = now.plus({ days: 1 });
        await onSale.save();
        void noSale;

        const res = await client.get("/api/v1/admin/products?on_sale=1");
        res.assertStatus(200);
        assert.equal(res.body().meta.total, 1);
        assert.equal(res.body().data[0].id, Number(onSale.id));
    });
});
