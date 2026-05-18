import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import { createAttributeWithTerm } from "./helpers.js";

test.group("Catalog attributes", (group) => {
    group.each.setup(async () => testUtils.db().truncate());

    test("attribute slug never gets a pa_ prefix (created via admin endpoint)", async ({ client, assert }) => {
        const response = await client.post("/api/v1/admin/attributes").json({
            code: "color",
            order_by: "menu_order",
            translations: [
                { locale: "fa", name: "رنگ" },
                { locale: "en", name: "Color" },
            ],
        });
        response.assertStatus(201);
        assert.notMatch(response.body().data.code, /^pa_/);
    });

    test("creating a term under an attribute returns the new term row", async ({ client, assert }) => {
        const { attribute } = await createAttributeWithTerm({
            code: "size",
            attrFa: "سایز",
            attrEn: "Size",
            term: { fa: "اس", en: "S", slug: "s" },
        });
        const response = await client.post(`/api/v1/admin/attributes/${attribute.id}/terms`).json({
            menu_order: 1,
            translations: [
                { locale: "fa", name: "ام", slug: "size-m-fa" },
                { locale: "en", name: "M", slug: "size-m" },
            ],
        });
        response.assertStatus(201);
        assert.equal(response.body().data.attribute_id, Number(attribute.id));
    });

    test("attribute terms list returns translated rows", async ({ client, assert }) => {
        const { attribute } = await createAttributeWithTerm({
            code: "material",
            attrFa: "متریال",
            attrEn: "Material",
            term: { fa: "پنبه", en: "Cotton", slug: "cotton" },
        });
        const response = await client.get(`/api/v1/attributes/${attribute.id}/terms`).header("Accept-Language", "fa");
        response.assertStatus(200);
        assert.equal(response.body().data[0].name, "پنبه");
    });
});
