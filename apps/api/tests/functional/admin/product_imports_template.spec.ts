import { test } from "@japa/runner";
import Papa from "papaparse";

import { IMPORT_FIELD_BY_KEY, IMPORT_FIELDS } from "#services/product_import/import_field_catalog";
import { TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS } from "#services/product_import/template_columns";
import { createImportAdmin, truncateImportTables } from "#tests/helpers/product_imports";

/**
 * Trip-wire suite for the downloadable CSV template.
 *
 * The template + the importer field catalogue evolve over time, and it is easy for one to drift
 * out of sync with the other — e.g. someone adds `inventory_warehouse` to `IMPORT_FIELDS` but
 * forgets to ship a sample column, or removes a field from the catalogue but leaves the column
 * in the template. Either drift produces an operator-facing bug:
 *
 * - Template header that isn't in the catalogue → upload of the downloaded template hands you a
 *   column the auto-mapper can't resolve (silent: the operator has to manually map something we
 *   shipped them).
 * - Catalogue field added without a deliberate template decision → the template's "shows you what
 *   fits where" promise erodes over time.
 *
 * The two trip-wires below assert against frozen snapshots of (a) the template header list and
 * (b) the catalogue's full key set. Whenever either list changes, the test fails and the message
 * tells the reviewer what to update. Updating means EDITING THE EXPECTED SNAPSHOT IN THIS FILE
 * after a deliberate review — not "just re-run with --update".
 */

/**
 * Frozen snapshot of the template header order. Edit this list ONLY after you've decided that the
 * template should ship a new column (or stop shipping one). If you grow `IMPORT_FIELDS` without
 * touching the template, the second trip-wire below will fail too and remind you to consider it.
 */
const EXPECTED_TEMPLATE_HEADERS = [
    "sku",
    "name",
    "type",
    "status",
    "regular_price",
    "sale_price",
    "stock_quantity",
    "stock_status",
    "categories",
    "tags",
    "brand",
    "short_description",
    "description",
    "weight",
    "length",
    "width",
    "height",
    "images",
    "parent_sku",
    "external_url",
];

/**
 * Frozen snapshot of every field key the importer accepts. When you add a new field to
 * `IMPORT_FIELDS`, this list fails and you must:
 *
 *   1. Add the new key here (so future readers see what the importer accepts at a glance).
 *   2. Decide explicitly whether the template should ship a column for it. If yes, update
 *      `TEMPLATE_HEADERS` + `TEMPLATE_SAMPLE_ROWS` in `app/services/product_import/template_columns.ts`
 *      and `EXPECTED_TEMPLATE_HEADERS` above. If no, add a one-line `// excluded: <reason>` comment
 *      next to the new key here.
 */
const EXPECTED_FIELD_KEYS = [
    "sku",
    "name",
    "type",
    "status",
    "short_description",
    "description",
    "visibility",
    "featured",
    "allow_reviews",
    "purchase_note",
    "menu_order",
    "regular_price",
    "sale_price",
    "sale_price_start",
    "sale_price_end",
    "tax_status",
    "tax_class",
    "manage_stock",
    "stock_quantity",
    "stock_status",
    "backorders_allowed",
    "sold_individually",
    "weight",
    "length",
    "width",
    "height",
    "shipping_class",
    "categories",
    "tags",
    "brand",
    "images",
    "parent_sku",
    "upsells",
    "cross_sells",
    "external_url",
    "button_text",
];

test.group("/api/v1/admin/products/import/template — trip-wires", (group) => {
    group.each.setup(async () => {
        await truncateImportTables();
    });

    test("template header list matches the frozen snapshot", ({ assert }) => {
        assert.deepEqual(
            [...TEMPLATE_HEADERS],
            EXPECTED_TEMPLATE_HEADERS,
            "TEMPLATE_HEADERS drifted from EXPECTED_TEMPLATE_HEADERS — if this change was intentional, update EXPECTED_TEMPLATE_HEADERS in this test file too (and consider whether the corresponding sample-row columns + i18n field labels are still in sync).",
        );
    });

    test("every field key matches the frozen snapshot", ({ assert }) => {
        const actualKeys = IMPORT_FIELDS.map((f) => f.key).sort();
        const expectedKeys = [...EXPECTED_FIELD_KEYS].sort();
        assert.deepEqual(
            actualKeys,
            expectedKeys,
            "IMPORT_FIELDS changed — if you added a field, update EXPECTED_FIELD_KEYS in this test file AND decide whether to add it to TEMPLATE_HEADERS in app/services/product_import/template_columns.ts.",
        );
    });

    test("every template header resolves to a real field key", ({ assert }) => {
        for (const header of TEMPLATE_HEADERS) {
            assert.isTrue(
                IMPORT_FIELD_BY_KEY.has(header),
                `template header "${header}" is not a known IMPORT_FIELDS key — either rename it to the canonical key or remove it from TEMPLATE_HEADERS.`,
            );
        }
    });

    test("every sample row has the same column count as the headers", ({ assert }) => {
        const expected = TEMPLATE_HEADERS.length;
        TEMPLATE_SAMPLE_ROWS.forEach((row, idx) => {
            assert.equal(
                row.length,
                expected,
                `sample row ${idx} has ${row.length} columns, expected ${expected} — pad the row with empty strings or trim it so it matches TEMPLATE_HEADERS.`,
            );
        });
    });

    test("every field marked required-for-create appears in the template", ({ assert }) => {
        const required = IMPORT_FIELDS.filter((f) => f.required === "create").map((f) => f.key);
        for (const key of required) {
            assert.include(
                [...TEMPLATE_HEADERS],
                key,
                `field "${key}" is required to create a product but isn't in TEMPLATE_HEADERS — operators downloading the template wouldn't know they need to fill it.`,
            );
        }
    });

    test("HTTP response parses cleanly and matches the in-memory template", async ({ client, assert }) => {
        const admin = await createImportAdmin();
        const response = await client.get("/api/v1/admin/products/import/template").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        const body = response.text();
        assert.isTrue(body.startsWith("﻿"), "template must begin with UTF-8 BOM");

        const parsed = Papa.parse<string[]>(body.replace(/^﻿/, ""), {
            header: false,
            skipEmptyLines: true,
        });
        assert.deepEqual(parsed.errors, [], "papaparse should consume the template without errors");

        const rows = parsed.data;
        assert.isAtLeast(rows.length, TEMPLATE_SAMPLE_ROWS.length + 1, "expected header row + every sample row");

        assert.deepEqual(rows[0], [...TEMPLATE_HEADERS], "first CSV row should equal TEMPLATE_HEADERS exactly");

        TEMPLATE_SAMPLE_ROWS.forEach((expectedRow, idx) => {
            assert.deepEqual(
                rows[idx + 1],
                [...expectedRow],
                `sample row ${idx} in the served CSV doesn't match TEMPLATE_SAMPLE_ROWS — make sure the controller still streams from the template_columns module.`,
            );
        });
    });
});
