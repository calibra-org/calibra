import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import { createAdmin, createProduct } from "./helpers.js";
import User from "#models/user";

/**
 * Per-admin-user product favourites: the `PUT`/`DELETE /products/{id}/favorite` toggle, the
 * `favorites=1` list filter, the `is_favorite` per-row flag, and per-user isolation. Replaces the
 * old localStorage-only favourites with server-backed state.
 */
test.group("Admin product favorites", (group) => {
    let admin: Awaited<ReturnType<typeof createAdmin>>;
    group.each.setup(async () => {
        admin = await createAdmin();
        return await testUtils.db().truncate();
    });

    test("PUT stars the product; favorites=1 + is_favorite reflect it", async ({ client, assert }) => {
        const a = await createProduct({ fa: { name: "آ" }, en: { name: "A" } });
        const b = await createProduct({ fa: { name: "ب" }, en: { name: "B" } });

        const put = await client.put(`/api/v1/admin/products/${Number(a.id)}/favorite`).withGuard("api").loginAs(admin);
        put.assertStatus(200);
        put.assertAgainstApiSpec();
        assert.equal(put.body().data.id, Number(a.id));
        assert.equal(put.body().data.is_favorite, true);

        /** Idempotent — re-starring is a no-op, still 200. */
        const again = await client.put(`/api/v1/admin/products/${Number(a.id)}/favorite`).withGuard("api").loginAs(admin);
        again.assertStatus(200);

        const fav = await client.get("/api/v1/admin/products?favorites=1").withGuard("api").loginAs(admin);
        fav.assertStatus(200);
        assert.equal(fav.body().meta.total, 1);
        assert.equal(fav.body().data[0].id, Number(a.id));
        assert.equal(fav.body().data[0].is_favorite, true);

        const all = await client.get("/api/v1/admin/products").withGuard("api").loginAs(admin);
        all.assertStatus(200);
        const flag = new Map(
            (all.body().data as Array<{ id: number; is_favorite: boolean }>).map((r) => [r.id, r.is_favorite]),
        );
        assert.equal(flag.get(Number(a.id)), true);
        assert.equal(flag.get(Number(b.id)), false);
    });

    test("DELETE unstars the product (idempotent 204)", async ({ client, assert }) => {
        const a = await createProduct({ fa: { name: "آ" }, en: { name: "A" } });
        await client.put(`/api/v1/admin/products/${Number(a.id)}/favorite`).withGuard("api").loginAs(admin);

        const del = await client.delete(`/api/v1/admin/products/${Number(a.id)}/favorite`).withGuard("api").loginAs(admin);
        del.assertStatus(204);
        const again = await client.delete(`/api/v1/admin/products/${Number(a.id)}/favorite`).withGuard("api").loginAs(admin);
        again.assertStatus(204);

        const fav = await client.get("/api/v1/admin/products?favorites=1").withGuard("api").loginAs(admin);
        assert.equal(fav.body().meta.total, 0);
    });

    test("favorites are per-user — one admin's stars don't leak to another", async ({ client, assert }) => {
        const other = await createAdmin();
        const a = await createProduct({ fa: { name: "آ" }, en: { name: "A" } });
        await client.put(`/api/v1/admin/products/${Number(a.id)}/favorite`).withGuard("api").loginAs(admin);

        const otherFav = await client.get("/api/v1/admin/products?favorites=1").withGuard("api").loginAs(other);
        otherFav.assertStatus(200);
        assert.equal(otherFav.body().meta.total, 0);
    });

    test("requires authentication (401)", async ({ client }) => {
        const a = await createProduct({ fa: { name: "آ" }, en: { name: "A" } });
        const res = await client.put(`/api/v1/admin/products/${Number(a.id)}/favorite`);
        res.assertStatus(401);
    });

    test("requires admin role (403)", async ({ client }) => {
        const a = await createProduct({ fa: { name: "آ" }, en: { name: "A" } });
        const nonAdmin = await User.create({
            email: `cust-${Date.now()}@catalog-test.dev`,
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        const res = await client.put(`/api/v1/admin/products/${Number(a.id)}/favorite`).withGuard("api").loginAs(nonAdmin);
        res.assertStatus(403);
    });
});
