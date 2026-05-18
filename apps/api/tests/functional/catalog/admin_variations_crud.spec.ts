import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import { createAttributeWithTerm, createProduct } from "./helpers.js";
import ProductAttributeLink from "#models/product_attribute_link";

test.group("Admin variations CRUD", (group) => {
    group.each.setup(async () => testUtils.db().truncate());

    test("creating a variation requires parent type=variable", async ({ client }) => {
        const product = await createProduct({
            fa: { name: "ساده", slug: "simple-fa" },
            en: { name: "Simple", slug: "simple-en" },
        });
        const response = await client.post(`/api/v1/admin/products/${product.id}/variations`).json({
            sku: "VAR-1",
            regular_price: 1_000_000,
        });
        response.assertStatus(422);
    });

    test("attribute_pins must reference variation attributes on the parent", async ({ client, assert }) => {
        const product = await createProduct({
            fa: { name: "متغیر", slug: "var-fa" },
            en: { name: "Variable", slug: "var-en" },
            type: "variable",
        });
        const { attribute, term } = await createAttributeWithTerm({
            code: "color",
            attrFa: "رنگ",
            attrEn: "Color",
            term: { fa: "مشکی", en: "Black", slug: "black" },
        });
        // Link exists but with used_for_variation=false → pin should be rejected
        await ProductAttributeLink.create({
            productId: product.id,
            attributeId: attribute.id,
            position: 0,
            visible: true,
            usedForVariation: false,
        });
        const response = await client.post(`/api/v1/admin/products/${product.id}/variations`).json({
            sku: "VAR-2",
            regular_price: 1_000_000,
            attribute_pins: [{ attribute_id: Number(attribute.id), term_id: Number(term.id) }],
        });
        response.assertStatus(422);
        assert.equal(response.body().error, "attribute_pin_not_variation_attribute");
    });

    test("a variation with manage_stock_mode=parent defers stock to the parent", async ({ client }) => {
        const product = await createProduct({
            fa: { name: "والد", slug: "parent-fa" },
            en: { name: "Parent", slug: "parent-en" },
            type: "variable",
        });
        const response = await client.post(`/api/v1/admin/products/${product.id}/variations`).json({
            sku: "VAR-3",
            regular_price: 1_000_000,
            manage_stock_mode: "parent",
        });
        response.assertStatus(201);
    });
});
