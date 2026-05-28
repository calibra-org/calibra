import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import { createAdmin, createProduct } from "./helpers.js";
import Media from "#models/media";
import Product from "#models/product";
import ProductDownload from "#models/product_download";

async function createMedia(label: string) {
    return await Media.create({
        kind: "file",
        url: `https://cdn.example.com/${label}.pdf`,
        mime: "application/pdf",
        alt: null,
        attributes: {},
    });
}

test.group("Admin product detail extensions", (group) => {
    let admin: Awaited<ReturnType<typeof createAdmin>>;
    group.each.setup(async () => {
        admin = await createAdmin();
        return await testUtils.db().truncate();
    });

    test("PATCH syncs upsells / cross-sells / grouped members in order", async ({ client, assert }) => {
        const subject = await createProduct({ fa: { name: "اصلی", slug: "main-fa" }, en: { name: "Main", slug: "main-en" } });
        const up = await createProduct({ fa: { name: "آپ", slug: "up-fa" }, en: { name: "Up", slug: "up-en" } });
        const cross = await createProduct({
            fa: { name: "کراس", slug: "cross-fa" },
            en: { name: "Cross", slug: "cross-en" },
        });
        const member = await createProduct({
            fa: { name: "عضو", slug: "member-fa" },
            en: { name: "Member", slug: "member-en" },
        });
        const response = await client
            .patch(`/api/v1/admin/products/${subject.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                upsell_ids: [Number(up.id)],
                cross_sell_ids: [Number(cross.id)],
                grouped_member_ids: [Number(member.id)],
            });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.deepEqual(response.body().data.upsell_ids, [Number(up.id)]);
        assert.deepEqual(response.body().data.cross_sell_ids, [Number(cross.id)]);
        assert.deepEqual(response.body().data.grouped_member_ids, [Number(member.id)]);
    });

    test("PATCH rejects unknown linked product ids with 422", async ({ client }) => {
        const subject = await createProduct({ fa: { name: "س", slug: "s-fa" }, en: { name: "S", slug: "s-en" } });
        const response = await client
            .patch(`/api/v1/admin/products/${subject.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                upsell_ids: [999_999],
            });
        response.assertStatus(422);
    });

    test("downloads replace-all upserts new and removes missing", async ({ client, assert }) => {
        const subject = await createProduct({ fa: { name: "دل", slug: "dl-fa" }, en: { name: "Dl", slug: "dl-en" } });
        const m1 = await createMedia("first");
        const m2 = await createMedia("second");
        let response = await client
            .patch(`/api/v1/admin/products/${subject.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                downloads: [
                    { media_id: Number(m1.id), file_label: "First", download_limit: 5, download_expiry_days: null },
                    { media_id: Number(m2.id), file_label: "Second", download_limit: null, download_expiry_days: 30 },
                ],
            });
        response.assertStatus(200);
        const stored = await ProductDownload.query().where("product_id", String(subject.id)).orderBy("position");
        assert.equal(stored.length, 2);

        const firstId = stored[0]!.id;
        response = await client
            .patch(`/api/v1/admin/products/${subject.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                downloads: [{ id: Number(firstId), media_id: Number(m1.id), file_label: "First v2", download_limit: 9 }],
            });
        response.assertStatus(200);
        const afterReplace = await ProductDownload.query().where("product_id", String(subject.id));
        assert.equal(afterReplace.length, 1);
        assert.equal(afterReplace[0]!.fileLabel, "First v2");
    });

    test("pos_available round-trips through the validator + transformer", async ({ client, assert }) => {
        const subject = await createProduct({ fa: { name: "پوس", slug: "pos-fa" }, en: { name: "POS", slug: "pos-en" } });
        const response = await client
            .patch(`/api/v1/admin/products/${subject.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ pos_available: false });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.isFalse(response.body().data.pos_available);
    });

    test("If-Match=current updated_at lets the write through", async ({ client }) => {
        const subject = await createProduct({ fa: { name: "م", slug: "m-fa" }, en: { name: "M", slug: "m-en" } });
        const reloaded = await Product.findOrFail(subject.id);
        const updatedAt = reloaded.updatedAt.toISO();
        const response = await client
            .patch(`/api/v1/admin/products/${subject.id}`)
            .header("If-Match", updatedAt!)
            .json({ featured: true })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
    });

    test("If-Match=stale value returns 409 with the current updated_at", async ({ client, assert }) => {
        const subject = await createProduct({
            fa: { name: "متضاد", slug: "conflict-fa" },
            en: { name: "Conflict", slug: "conflict-en" },
        });
        const response = await client
            .patch(`/api/v1/admin/products/${subject.id}`)
            .header("If-Match", "1970-01-01T00:00:00.000Z")
            .json({ featured: true })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(409);
        assert.exists(response.body().data?.updated_at);
    });

    test("check-slug returns false for taken slug", async ({ client, assert }) => {
        await createProduct({ fa: { name: "تکراری", slug: "duplicate-fa" }, en: { name: "Dup", slug: "duplicate-en" } });
        const response = await client
            .get("/api/v1/admin/products/check-slug?slug=duplicate-en&locale=en")
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.isFalse(response.body().data.available);
    });

    test("check-slug returns true for free slug", async ({ client, assert }) => {
        const response = await client
            .get("/api/v1/admin/products/check-slug?slug=brand-new-slug&locale=en")
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.isTrue(response.body().data.available);
    });

    test("check-slug excludeId ignores the edited row", async ({ client, assert }) => {
        const p = await createProduct({ fa: { name: "خ", slug: "mine-fa" }, en: { name: "Mine", slug: "mine-en" } });
        const response = await client
            .get(`/api/v1/admin/products/check-slug?slug=mine-en&locale=en&excludeId=${Number(p.id)}`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.isTrue(response.body().data.available);
    });
});
