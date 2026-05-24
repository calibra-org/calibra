import { test } from "@japa/runner";

import { hashHeaderSet, matchHeader, normalizeHeader, suggestMapping } from "#services/product_import/import_field_catalog";

test.group("product_import / import_field_catalog / normalizeHeader", () => {
    test("strips whitespace, dashes, underscores, punctuation", ({ assert }) => {
        assert.equal(normalizeHeader("Regular Price"), "regularprice");
        assert.equal(normalizeHeader("REGULAR_PRICE"), "regularprice");
        assert.equal(normalizeHeader("Regular-Price"), "regularprice");
        assert.equal(normalizeHeader("regular.price"), "regularprice");
    });

    test("strips UTF-8 BOM", ({ assert }) => {
        assert.equal(normalizeHeader("﻿SKU"), "sku");
    });

    test("preserves Persian letters and digits", ({ assert }) => {
        assert.equal(normalizeHeader("قیمت اصلی"), "قیمتاصلی");
    });
});

test.group("product_import / import_field_catalog / matchHeader", () => {
    test("matches English aliases", ({ assert }) => {
        assert.equal(matchHeader("SKU")?.key, "sku");
        assert.equal(matchHeader("Regular Price")?.key, "regular_price");
        assert.equal(matchHeader("Stock Quantity")?.key, "stock_quantity");
        assert.equal(matchHeader("Sale Price")?.key, "sale_price");
    });

    test("matches Persian aliases", ({ assert }) => {
        assert.equal(matchHeader("نام")?.key, "name");
        assert.equal(matchHeader("قیمت اصلی")?.key, "regular_price");
        assert.equal(matchHeader("موجودی")?.key, "stock_quantity");
    });

    test("returns null for unknown headers", ({ assert }) => {
        assert.isNull(matchHeader("blah"));
        assert.isNull(matchHeader(""));
    });

    test("matches the bare key name itself", ({ assert }) => {
        assert.equal(matchHeader("sku")?.key, "sku");
        assert.equal(matchHeader("regular_price")?.key, "regular_price");
    });
});

test.group("product_import / import_field_catalog / hashHeaderSet", () => {
    test("produces stable hash regardless of header order", ({ assert }) => {
        const hashA = hashHeaderSet(["sku", "name", "regular_price"]);
        const hashB = hashHeaderSet(["regular_price", "name", "sku"]);
        assert.equal(hashA, hashB);
    });

    test("differs when header set differs", ({ assert }) => {
        const hashA = hashHeaderSet(["sku", "name"]);
        const hashB = hashHeaderSet(["sku", "name", "price"]);
        assert.notEqual(hashA, hashB);
    });

    test("normalizes case + separators in headers before hashing", ({ assert }) => {
        const hashA = hashHeaderSet(["SKU", "Regular Price"]);
        const hashB = hashHeaderSet(["sku", "regular_price"]);
        assert.equal(hashA, hashB);
    });
});

test.group("product_import / import_field_catalog / suggestMapping", () => {
    test("auto-maps recognized headers and leaves the rest null", ({ assert }) => {
        const mapping = suggestMapping(["sku", "name", "weird_extra_column"]);
        assert.equal(mapping["sku"], "sku");
        assert.equal(mapping["name"], "name");
        assert.isNull(mapping["weird_extra_column"]);
    });
});
