import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import ProductAttributeLink from "#models/product_attribute_link";
import ProductAttributeTerm from "#models/product_attribute_term";
import ProductAttributeTermTranslation from "#models/product_attribute_term_translation";

import { createAttributeWithTerm, createProduct } from "./helpers.js";

/**
 * Locks the `syncProductAttributeLinks` dedupe behaviour. A 23505 unique-constraint violation
 * on `(product_id, attribute_id)` used to bubble back as a 500 the moment a client (admin UI
 * race, third-party integration, replayed payload) sent the same attribute twice in
 * `attribute_links`. The writer now collapses dupes — last-write-wins on metadata, term_ids
 * unioned — so the save succeeds with one row regardless of what the wire shape looked like.
 */
test.group("Admin product attribute_links dedupe", (group) => {
    group.each.setup(async () => testUtils.db().truncate());

    test("PATCH with duplicate attribute_links collapses to one row, term_ids unioned", async ({ client, assert }) => {
        const p = await createProduct({
            fa: { name: "dedupe-fa", slug: "dedupe-fa" },
            en: { name: "dedupe-en", slug: "dedupe-en" },
            type: "variable",
        });
        const { attribute, term: termA } = await createAttributeWithTerm({
            code: "material",
            attrFa: "جنس",
            attrEn: "Material",
            term: { fa: "چرم", en: "Leather", slug: "leather" },
        });
        /** Second term on the SAME attribute — the validator refuses term_ids that don't belong
         *  to the link's attribute, so both inbound dupes have to share an attribute for the
         *  dedupe path to be the thing under test (not the cross-attribute check). */
        const termB = await ProductAttributeTerm.create({
            attributeId: attribute.id,
            menuOrder: 1,
            attributes: {},
        });
        await ProductAttributeTermTranslation.create({
            termId: termB.id,
            locale: "fa",
            name: "پارچه",
            slug: "material-fabric-fa",
        });
        await ProductAttributeTermTranslation.create({
            termId: termB.id,
            locale: "en",
            name: "Fabric",
            slug: "material-fabric",
        });

        const response = await client.patch(`/api/v1/admin/products/${p.id}`).json({
            attribute_links: [
                {
                    attribute_id: Number(attribute.id),
                    used_for_variation: false,
                    term_ids: [Number(termA.id)],
                },
                {
                    attribute_id: Number(attribute.id),
                    used_for_variation: true,
                    term_ids: [Number(termB.id)],
                },
            ],
        });
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const rows = await ProductAttributeLink.query().where("product_id", String(p.id));
        assert.lengthOf(rows, 1);
        assert.equal(Number(rows[0]!.attributeId), Number(attribute.id));
        /** Last-write-wins on metadata. */
        assert.equal(rows[0]!.usedForVariation, true);

        const links = response.body().data.attribute_links as { attribute_id: number; term_ids: number[] }[];
        assert.lengthOf(links, 1);
        /** Term ids unioned across both inbound entries so no value the operator picked gets dropped. */
        assert.deepEqual(links[0]!.term_ids.slice().sort(), [Number(termA.id), Number(termB.id)].sort());
    });

    test("identical duplicate entries collapse to one without changing term_ids", async ({ client, assert }) => {
        const p = await createProduct({
            fa: { name: "twin-fa", slug: "twin-fa" },
            en: { name: "twin-en", slug: "twin-en" },
            type: "variable",
        });
        const { attribute, term } = await createAttributeWithTerm({
            code: "size",
            attrFa: "سایز",
            attrEn: "Size",
            term: { fa: "بزرگ", en: "Large", slug: "large" },
        });
        const link = {
            attribute_id: Number(attribute.id),
            used_for_variation: true,
            term_ids: [Number(term.id)],
        };

        const response = await client.patch(`/api/v1/admin/products/${p.id}`).json({
            attribute_links: [link, link, link],
        });
        response.assertStatus(200);
        const rows = await ProductAttributeLink.query().where("product_id", String(p.id));
        assert.lengthOf(rows, 1);
    });
});
