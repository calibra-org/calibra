import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import Media from "#models/media";
import ProductBrand from "#models/product_brand";
import ProductCategory from "#models/product_category";
import User from "#models/user";

async function createAdmin(email = "admin@taxonomy-media.test") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "Admin", lastName: "User", countryDefault: "IR" });
    return user;
}

async function resetState() {
    await db.rawQuery(`TRUNCATE TABLE "product_brand_translations" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_brands" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_category_translations" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_categories" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "media" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`);
}

async function seedMedia(url = "https://cdn.example.com/logo.jpg"): Promise<Media> {
    const row = new Media();
    row.kind = "image";
    row.url = url;
    row.mime = "image/jpeg";
    row.filename = "logo.jpg";
    row.title = "Logo";
    row.alt = null;
    row.sizeBytes = 2048;
    row.width = 256;
    row.height = 256;
    row.attributes = {};
    await row.save();
    return row;
}

test.group("admin taxonomy media wiring — brands", (group) => {
    group.each.setup(async () => {
        await resetState();
    });

    test("create + show + list emit image_url and image_media_id", async ({ client, assert }) => {
        const admin = await createAdmin();
        const media = await seedMedia("https://cdn.example.com/brand-logo.jpg");

        const create = await client
            .post("/api/v1/admin/brands")
            .json({
                image_media_id: Number(media.id),
                translations: [{ locale: "fa", name: "برند تست", slug: "test-brand" }],
            })
            .withGuard("api")
            .loginAs(admin);
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        const created = create.body() as { data: { id: number; image_media_id: number | null; image_url: string | null } };
        assert.equal(created.data.image_media_id, Number(media.id));
        assert.equal(created.data.image_url, "https://cdn.example.com/brand-logo.jpg");

        const show = await client.get(`/api/v1/admin/brands/${created.data.id}`).withGuard("api").loginAs(admin);
        show.assertStatus(200);
        show.assertAgainstApiSpec();
        const detail = show.body() as { data: { image_media_id: number | null; image_url: string | null } };
        assert.equal(detail.data.image_media_id, Number(media.id));
        assert.equal(detail.data.image_url, "https://cdn.example.com/brand-logo.jpg");

        const list = await client.get("/api/v1/admin/brands").withGuard("api").loginAs(admin);
        list.assertStatus(200);
        const body = list.body() as { data: Array<{ id: number; image_url: string | null; image_media_id: number | null }> };
        const row = body.data.find((b) => b.id === created.data.id);
        assert.exists(row);
        assert.equal(row?.image_media_id, Number(media.id));
        assert.equal(row?.image_url, "https://cdn.example.com/brand-logo.jpg");
    });

    test("PATCH image_media_id swaps the linked media, null clears it", async ({ client, assert }) => {
        const admin = await createAdmin();
        const first = await seedMedia("https://cdn.example.com/first.jpg");
        const second = await seedMedia("https://cdn.example.com/second.jpg");

        const brand = new ProductBrand();
        brand.imageMediaId = first.id as bigint | number;
        await brand.save();
        await db.table("product_brand_translations").insert({
            brand_id: Number(brand.id),
            locale: "fa",
            name: "برند",
            slug: "brand",
        });

        const swap = await client
            .patch(`/api/v1/admin/brands/${brand.id}`)
            .json({ image_media_id: Number(second.id) })
            .withGuard("api")
            .loginAs(admin);
        swap.assertStatus(200);
        swap.assertAgainstApiSpec();
        const swapped = swap.body() as { data: { image_media_id: number | null; image_url: string | null } };
        assert.equal(swapped.data.image_media_id, Number(second.id));
        assert.equal(swapped.data.image_url, "https://cdn.example.com/second.jpg");

        const clear = await client
            .patch(`/api/v1/admin/brands/${brand.id}`)
            .json({ image_media_id: null })
            .withGuard("api")
            .loginAs(admin);
        clear.assertStatus(200);
        clear.assertAgainstApiSpec();
        const cleared = clear.body() as { data: { image_media_id: number | null; image_url: string | null } };
        assert.equal(cleared.data.image_media_id, null);
        assert.equal(cleared.data.image_url, null);
    });
});

test.group("admin taxonomy media wiring — categories", (group) => {
    group.each.setup(async () => {
        await resetState();
    });

    test("create + show + list emit image_url and image_media_id", async ({ client, assert }) => {
        const admin = await createAdmin();
        const media = await seedMedia("https://cdn.example.com/cover.jpg");

        const create = await client
            .post("/api/v1/admin/categories")
            .json({
                image_media_id: Number(media.id),
                translations: [{ locale: "fa", name: "دسته تست", slug: "test-category" }],
            })
            .withGuard("api")
            .loginAs(admin);
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        const created = create.body() as { data: { id: number; image_media_id: number | null; image_url: string | null } };
        assert.equal(created.data.image_media_id, Number(media.id));
        assert.equal(created.data.image_url, "https://cdn.example.com/cover.jpg");

        const show = await client.get(`/api/v1/admin/categories/${created.data.id}`).withGuard("api").loginAs(admin);
        show.assertStatus(200);
        show.assertAgainstApiSpec();
        const detail = show.body() as { data: { image_media_id: number | null; image_url: string | null } };
        assert.equal(detail.data.image_media_id, Number(media.id));
        assert.equal(detail.data.image_url, "https://cdn.example.com/cover.jpg");

        const list = await client.get("/api/v1/admin/categories").withGuard("api").loginAs(admin);
        list.assertStatus(200);
        const body = list.body() as { data: Array<{ id: number; image_url: string | null; image_media_id: number | null }> };
        const row = body.data.find((c) => c.id === created.data.id);
        assert.exists(row);
        assert.equal(row?.image_media_id, Number(media.id));
        assert.equal(row?.image_url, "https://cdn.example.com/cover.jpg");
    });

    test("PATCH image_media_id swaps the cover, null clears it", async ({ client, assert }) => {
        const admin = await createAdmin();
        const first = await seedMedia("https://cdn.example.com/cover-a.jpg");
        const second = await seedMedia("https://cdn.example.com/cover-b.jpg");

        const cat = new ProductCategory();
        cat.imageMediaId = first.id as bigint | number;
        await cat.save();
        await db.table("product_category_translations").insert({
            category_id: Number(cat.id),
            locale: "fa",
            name: "دسته",
            slug: "category",
        });

        const swap = await client
            .patch(`/api/v1/admin/categories/${cat.id}`)
            .json({ image_media_id: Number(second.id) })
            .withGuard("api")
            .loginAs(admin);
        swap.assertStatus(200);
        swap.assertAgainstApiSpec();
        const swapped = swap.body() as { data: { image_media_id: number | null; image_url: string | null } };
        assert.equal(swapped.data.image_media_id, Number(second.id));
        assert.equal(swapped.data.image_url, "https://cdn.example.com/cover-b.jpg");

        const clear = await client
            .patch(`/api/v1/admin/categories/${cat.id}`)
            .json({ image_media_id: null })
            .withGuard("api")
            .loginAs(admin);
        clear.assertStatus(200);
        clear.assertAgainstApiSpec();
        const cleared = clear.body() as { data: { image_media_id: number | null; image_url: string | null } };
        assert.equal(cleared.data.image_media_id, null);
        assert.equal(cleared.data.image_url, null);
    });
});
