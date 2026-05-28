import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import { createAdmin, createAttributeWithTerm, createProduct } from "./helpers.js";

/**
 * Round-trip for the new `product_attribute_links.display_type` column powering the per-choice
 * customer-facing UX selector (dropdown / pills / color_swatch / image_swatch). Defaults to
 * `dropdown` so existing products keep rendering.
 */
test.group("Admin attribute link display_type", (group) => {
    let admin: Awaited<ReturnType<typeof createAdmin>>;
    group.each.setup(async () => {
        admin = await createAdmin();
        return await testUtils.db().truncate();
    });

    test("PATCH sets display_type and the detail GET surfaces it", async ({ client, assert }) => {
        const p = await createProduct({
            fa: { name: "تنوع", slug: "swatch-fa" },
            en: { name: "Swatch", slug: "swatch-en" },
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
                        used_for_variation: true,
                        display_type: "color_swatch",
                        term_ids: [Number(term.id)],
                    },
                ],
            });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const links = response.body().data.attribute_links as { display_type: string }[];
        assert.lengthOf(links, 1);
        assert.equal(links[0]!.display_type, "color_swatch");

        const fetched = await client.get(`/api/v1/admin/products/${p.id}`).withGuard("api").loginAs(admin);
        fetched.assertStatus(200);
        fetched.assertAgainstApiSpec();
        const reloaded = fetched.body().data.attribute_links as { display_type: string }[];
        assert.equal(reloaded[0]!.display_type, "color_swatch");
    });

    test("display_type defaults to dropdown when omitted", async ({ client, assert }) => {
        const p = await createProduct({
            fa: { name: "پیش‌فرض", slug: "default-fa" },
            en: { name: "Default", slug: "default-en" },
            type: "variable",
        });
        const { attribute, term } = await createAttributeWithTerm({
            code: "size",
            attrFa: "سایز",
            attrEn: "Size",
            term: { fa: "متوسط", en: "Medium", slug: "medium" },
        });

        const response = await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                attribute_links: [
                    {
                        attribute_id: Number(attribute.id),
                        used_for_variation: true,
                        term_ids: [Number(term.id)],
                    },
                ],
            });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const links = response.body().data.attribute_links as { display_type: string }[];
        assert.equal(links[0]!.display_type, "dropdown");
    });

    test("invalid display_type enum is rejected", async ({ client }) => {
        const p = await createProduct({
            fa: { name: "خطا", slug: "err-fa" },
            en: { name: "Err", slug: "err-en" },
            type: "variable",
        });
        const { attribute, term } = await createAttributeWithTerm({
            code: "material",
            attrFa: "جنس",
            attrEn: "Material",
            term: { fa: "چرم", en: "Leather", slug: "leather" },
        });
        const response = await client
            .patch(`/api/v1/admin/products/${p.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                attribute_links: [
                    {
                        attribute_id: Number(attribute.id),
                        used_for_variation: true,
                        display_type: "bogus_picker",
                        term_ids: [Number(term.id)],
                    },
                ],
            });
        response.assertStatus(422);
    });
});
