import { test } from "@japa/runner";
import { truncateAndCleanup } from "#tests/helpers/truncate";

import { createAdmin, createAttributeWithTerm, createProduct } from "./helpers.js";
import ProductCustomAttribute from "#models/product_custom_attribute";

test.group("Admin product custom attributes", (group) => {
    let admin: Awaited<ReturnType<typeof createAdmin>>;
    group.each.setup(async () => {
        const cleanup = await truncateAndCleanup();
        admin = await createAdmin();
        return cleanup;
    });

    test("PATCH appends a custom attribute row and surfaces it on the detail GET", async ({ client, assert }) => {
        const p = await createProduct({ fa: { name: "محصول", slug: "p-fa" }, en: { name: "Product", slug: "p-en" } });
        const response = await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                custom_attributes: [{ name: "Material", values: ["cotton", "polyester"], position: 0, visible: true }],
            });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.lengthOf(response.body().data.custom_attributes, 1);
        assert.equal(response.body().data.custom_attributes[0].name, "Material");
        assert.deepEqual(response.body().data.custom_attributes[0].values, ["cotton", "polyester"]);

        const fetched = await client.get(`/api/v1/admin/products/${p.id}`).withGuard("api").loginAs(admin);
        fetched.assertStatus(200);
        fetched.assertAgainstApiSpec();
        assert.lengthOf(fetched.body().data.custom_attributes, 1);
        assert.equal(fetched.body().data.custom_attributes[0].name, "Material");
    });

    test("PATCH with same custom_attributes id updates in place; missing id deletes the row", async ({ client, assert }) => {
        const p = await createProduct({ fa: { name: "محصول دو", slug: "p2-fa" }, en: { name: "Product 2", slug: "p2-en" } });
        const first = await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                custom_attributes: [
                    { name: "Material", values: ["cotton"], position: 0 },
                    { name: "Origin", values: ["Iran"], position: 1 },
                ],
            });
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        const [material, origin] = first.body().data.custom_attributes as { id: number; name: string }[];
        assert.equal(material!.name, "Material");
        assert.equal(origin!.name, "Origin");

        const second = await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                custom_attributes: [{ id: material!.id, name: "Material", values: ["cotton", "linen"], position: 0 }],
            });
        second.assertStatus(200);
        second.assertAgainstApiSpec();
        const rows = second.body().data.custom_attributes as { id: number; name: string; values: string[] }[];
        assert.lengthOf(rows, 1);
        assert.equal(rows[0]!.id, material!.id);
        assert.deepEqual(rows[0]!.values, ["cotton", "linen"]);

        const remaining = await ProductCustomAttribute.query().where("product_id", String(p.id));
        assert.lengthOf(remaining, 1);
    });

    test("PATCH with empty array removes every custom row for the product", async ({ client, assert }) => {
        const p = await createProduct({ fa: { name: "حذف", slug: "wipe-fa" }, en: { name: "Wipe", slug: "wipe-en" } });
        await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                custom_attributes: [{ name: "Material", values: ["cotton"] }],
            });
        const cleared = await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ custom_attributes: [] });
        cleared.assertStatus(200);
        cleared.assertAgainstApiSpec();
        assert.lengthOf(cleared.body().data.custom_attributes, 0);
        const remaining = await ProductCustomAttribute.query().where("product_id", String(p.id));
        assert.lengthOf(remaining, 0);
    });

    test("PATCH rejects a custom_attributes entry with empty name with 422", async ({ client }) => {
        const p = await createProduct({ fa: { name: "بد", slug: "bad-fa" }, en: { name: "Bad", slug: "bad-en" } });
        const response = await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                custom_attributes: [{ name: "", values: ["x"] }],
            });
        response.assertStatus(422);
    });

    test("listing endpoint does NOT preload custom_attributes (regression: never bloats the list payload)", async ({
        client,
        assert,
    }) => {
        const p = await createProduct({ fa: { name: "لیست", slug: "list-fa" }, en: { name: "List", slug: "list-en" } });
        await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                custom_attributes: [{ name: "Material", values: ["cotton"] }],
            });
        const list = await client.get("/api/v1/admin/products").withGuard("api").loginAs(admin);
        list.assertStatus(200);
        list.assertAgainstApiSpec();
        const row = (list.body().data as { id: number; custom_attributes?: unknown[] }[]).find(
            (r) => Number(r.id) === Number(p.id),
        );
        assert.exists(row);
        assert.deepEqual(row?.custom_attributes ?? [], [], "listing must never carry the loaded custom rows");
    });

    test("PATCH with custom_attributes does not pollute attribute_links (variations cartesian guard)", async ({
        client,
        assert,
    }) => {
        const p = await createProduct({
            fa: { name: "تنوع", slug: "var-fa" },
            en: { name: "Var", slug: "var-en" },
            type: "variable",
        });
        const { attribute, term } = await createAttributeWithTerm({
            code: "color",
            attrFa: "رنگ",
            attrEn: "Color",
            term: { fa: "آبی", en: "Blue", slug: "blue" },
        });
        const response = await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                attribute_links: [
                    {
                        attribute_id: Number(attribute.id),
                        position: 0,
                        visible: true,
                        used_for_variation: true,
                        term_ids: [Number(term.id)],
                    },
                ],
                custom_attributes: [{ name: "Origin", values: ["Iran"] }],
            });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.lengthOf(response.body().data.attribute_links, 1);
        assert.equal(response.body().data.attribute_links[0].attribute_id, Number(attribute.id));
        assert.lengthOf(response.body().data.custom_attributes, 1);
        assert.equal(response.body().data.custom_attributes[0].name, "Origin");
    });
});
