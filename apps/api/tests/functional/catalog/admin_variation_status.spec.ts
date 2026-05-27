import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import { createAttributeWithTerm, createProduct } from "./helpers.js";
import ProductAttributeLink from "#models/product_attribute_link";
import ProductVariation from "#models/product_variation";

/**
 * Lifecycle for the new `product_variations.status` column powering the Sellable versions
 * data-grid. Covers single-row create with explicit status, PATCH transitions, batch status
 * updates, and the load-bearing default (`active`) that keeps unmigrated rows sellable.
 */
test.group("Admin variation status", (group) => {
    group.each.setup(async () => testUtils.db().truncate());

    test("creating a variation defaults status to active", async ({ client, assert }) => {
        const p = await createProduct({
            fa: { name: "متغیر", slug: "var-fa" },
            en: { name: "Variable", slug: "var-en" },
            type: "variable",
        });
        const response = await client.post(`/api/v1/admin/products/${p.id}/variations`).json({
            sku: "STAT-DEF",
            regular_price: 1_000_000,
        });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        assert.equal(response.body().data.status, "active");
    });

    test("status=draft on create is accepted and round-trips", async ({ client, assert }) => {
        const p = await createProduct({
            fa: { name: "متغیر-دو", slug: "var2-fa" },
            en: { name: "Variable 2", slug: "var2-en" },
            type: "variable",
        });
        const created = await client.post(`/api/v1/admin/products/${p.id}/variations`).json({
            sku: "STAT-DRAFT",
            regular_price: 1_000_000,
            status: "draft",
        });
        created.assertStatus(201);
        created.assertAgainstApiSpec();
        assert.equal(created.body().data.status, "draft");

        const fetched = await client.get(`/api/v1/admin/products/${p.id}/variations`);
        fetched.assertStatus(200);
        fetched.assertAgainstApiSpec();
        const row = (fetched.body().data as { id: number; status: string }[]).find((r) => r.id === created.body().data.id);
        assert.exists(row);
        assert.equal(row!.status, "draft");
    });

    test("PATCH transitions draft → active → archived", async ({ client, assert }) => {
        const p = await createProduct({
            fa: { name: "چرخه", slug: "lifecycle-fa" },
            en: { name: "Lifecycle", slug: "lifecycle-en" },
            type: "variable",
        });
        const created = await client.post(`/api/v1/admin/products/${p.id}/variations`).json({
            sku: "LC-1",
            regular_price: 500_000,
            status: "draft",
        });
        created.assertStatus(201);
        const id = created.body().data.id as number;

        const toActive = await client.patch(`/api/v1/admin/products/${p.id}/variations/${id}`).json({
            status: "active",
        });
        toActive.assertStatus(200);
        toActive.assertAgainstApiSpec();
        assert.equal(toActive.body().data.status, "active");

        const toArchived = await client.patch(`/api/v1/admin/products/${p.id}/variations/${id}`).json({
            status: "archived",
        });
        toArchived.assertStatus(200);
        toArchived.assertAgainstApiSpec();
        assert.equal(toArchived.body().data.status, "archived");
    });

    test("invalid status enum is rejected", async ({ client }) => {
        const p = await createProduct({
            fa: { name: "رد", slug: "reject-fa" },
            en: { name: "Reject", slug: "reject-en" },
            type: "variable",
        });
        const response = await client.post(`/api/v1/admin/products/${p.id}/variations`).json({
            sku: "BAD",
            regular_price: 100_000,
            status: "bogus",
        });
        response.assertStatus(422);
    });

    test("batch update flips status on multiple variations in one round-trip", async ({ client, assert }) => {
        const p = await createProduct({
            fa: { name: "گروهی", slug: "batch-fa" },
            en: { name: "Batch", slug: "batch-en" },
            type: "variable",
        });
        const first = await client.post(`/api/v1/admin/products/${p.id}/variations`).json({
            sku: "B-1",
            regular_price: 100_000,
            status: "draft",
        });
        const second = await client.post(`/api/v1/admin/products/${p.id}/variations`).json({
            sku: "B-2",
            regular_price: 200_000,
            status: "draft",
        });

        const batch = await client.post(`/api/v1/admin/products/${p.id}/variations/batch`).json({
            update: [
                { id: first.body().data.id, status: "active" },
                { id: second.body().data.id, status: "inactive" },
            ],
        });
        batch.assertStatus(200);

        const reloaded = await ProductVariation.query().where("product_id", String(p.id)).orderBy("id");
        const byId = new Map(reloaded.map((row) => [Number(row.id), row.status]));
        assert.equal(byId.get(first.body().data.id), "active");
        assert.equal(byId.get(second.body().data.id), "inactive");
    });

    test("GET surfaces status on the embedded variations list of the product detail", async ({ client, assert }) => {
        const p = await createProduct({
            fa: { name: "نمایش", slug: "show-fa" },
            en: { name: "Show", slug: "show-en" },
            type: "variable",
        });
        const { attribute, term } = await createAttributeWithTerm({
            code: "color",
            attrFa: "رنگ",
            attrEn: "Color",
            term: { fa: "سرمه‌ای", en: "Navy", slug: "navy" },
        });
        await ProductAttributeLink.create({
            productId: p.id,
            attributeId: attribute.id,
            position: 0,
            visible: true,
            usedForVariation: true,
        });
        await client.post(`/api/v1/admin/products/${p.id}/variations`).json({
            sku: "SHOW-1",
            regular_price: 750_000,
            status: "active",
            attribute_pins: [{ attribute_id: Number(attribute.id), term_id: Number(term.id) }],
        });
        const detail = await client.get(`/api/v1/admin/products/${p.id}`);
        detail.assertStatus(200);
        detail.assertAgainstApiSpec();
        const variations = detail.body().data.variations as { status: string }[];
        assert.lengthOf(variations, 1);
        assert.equal(variations[0]!.status, "active");
    });
});
